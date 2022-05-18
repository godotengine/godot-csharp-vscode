import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as chokidar from 'chokidar';
import * as semver from 'semver';
import PromiseSocket from 'promise-socket';
import { Disposable } from 'vscode';
import {GODOT_VERSION_3, GODOT_VERSION_4} from '../godot-utils';

async function timeout(ms: number) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

class CustomSocket extends PromiseSocket<net.Socket> {
    buffer: string = '';

    constructor() {
        super();
        this.setEncoding('utf-8');
    }

    async readLine(): Promise<string | undefined> {
        let chunk: Buffer | string | undefined;

        do {
            if (chunk !== undefined) {
                if (chunk instanceof Buffer) {
                    this.buffer += chunk.toString('utf-8');
                } else {
                    this.buffer += chunk;
                }
            }

            let indexOfLineBreak = this.buffer.indexOf('\n');

            if (indexOfLineBreak >= 0) {
                let hasCR = indexOfLineBreak !== 0 && this.buffer.charAt(indexOfLineBreak - 1) === '\r';
                let line = this.buffer.substring(0, hasCR ? indexOfLineBreak - 1 : indexOfLineBreak);
                this.buffer = this.buffer.substring(indexOfLineBreak + 1);
                return line;
            }
        }
        while ((chunk = await this.read()) !== undefined);

        return undefined;
    }

    async writeLine(line: string): Promise<number> {
        return await this.write(line + '\n', 'utf-8');
    }
}

type ResponseListener = (response: MessageContent) => void;

export class Peer implements Disposable {
    static readonly protocolVersionMajor: number = 1;
    static readonly protocolVersionMinor: number = 1;
    static readonly protocolVersionRevision: number = 0;

    static readonly clientHandshakeName: string = 'GodotIdeClient';
    static readonly serverHandshakeName: string = 'GodotIdeServer';

    socket: CustomSocket;
    handshake: IHandshake;
    messageHandler: IMessageHandler;
    logger: ILogger;

    remoteIdentity?: string;
    isConnected: boolean = false;

    requestAwaiterQueues = new Map<string, ResponseListener[]>();

    constructor(socket: CustomSocket, handshake: IHandshake, messageHandler: IMessageHandler, logger: ILogger) {
        this.socket = socket;
        this.handshake = handshake;
        this.messageHandler = messageHandler;
        this.logger = logger;
    }

    dispose() {
        this.socket?.destroy();
    }

    async process(): Promise<void> {
        let decoder = new MessageDecoder();

        let messageLine: string | undefined;
        while ((messageLine = await this.socket.readLine()) !== undefined) {
            let [state, msg] = decoder.decode(messageLine);

            if (state === MessageDecoderState.Decoding) {
                continue; // Not finished decoding yet
            }

            if (state === MessageDecoderState.Errored || msg === undefined) {
                this.logger.logError(`Received message line with invalid format: ${messageLine}`);
                continue;
            }

            this.logger.logDebug(`Received message: ${msg.toString()}`);

            if (msg.kind === MessageKind.Request) {
                let responseContent = await this.messageHandler
                    .handleRequest(this, msg.id, msg.content, this.logger);
                await this.writeMessage(new Message(MessageKind.Response, msg.id, responseContent));
            } else if (msg.kind === MessageKind.Response) {
                let responseAwaiter: ResponseListener | undefined;
                let queue = this.requestAwaiterQueues.get(msg.id);
                if (queue === undefined || (responseAwaiter = queue.shift()) === undefined) {
                    this.logger.logError(`Received unexpected response: ${msg.id}`);
                    return;
                }
                responseAwaiter(msg.content);
            } else {
                this.logger.logError(`Invalid message kind ${MessageKind[msg.kind]}`);
                return;
            }
        }

        this.isConnected = false;
    }

    async doHandshake(identity: string): Promise<boolean> {
        if (await this.socket.writeLine(this.handshake.getHandshakeLine(identity)) === 0) {
            this.logger.logError('Could not write handshake');
            return false;
        }

        let handshakeReceived = false;

        let readHandshakeImpl = async (): Promise<string | undefined> => {
            let result = await this.socket.readLine();
            handshakeReceived = true;
            return result;
        };
        let readHandshakePromise = readHandshakeImpl();

        let maybePeerHandshake = await Promise.race([readHandshakePromise, timeout(8000)]);

        if (!handshakeReceived || maybePeerHandshake === undefined || typeof maybePeerHandshake !== 'string') {
            this.logger.logError('Timeout waiting for the client handshake');
            return false;
        }

        let peerHandshake = maybePeerHandshake as string;

        let [valid, remoteIdentity] = this.handshake.isValidPeerHandshake(peerHandshake, this.logger);

        if (!valid || remoteIdentity === undefined) {
            this.logger.logError('Received invalid handshake: ' + peerHandshake);
            return false;
        }

        this.remoteIdentity = remoteIdentity;

        this.isConnected = true;

        this.logger.logInfo('Peer connection started');

        return true;
    }

    private async writeMessage(message: Message): Promise<number> {
        this.logger.logDebug(`Sending message: ${message.toString()}`);

        let bodyLineCount = message.content.body.match(/[^\n]*\n[^\n]*/gi)?.length ?? 0;
        bodyLineCount += 1; // Extra line break at the end

        let messageLines: string = '';

        messageLines += MessageKind[message.kind] + '\n';
        messageLines += message.id + '\n';
        messageLines += MessageStatus[message.content.status] + '\n';
        messageLines += bodyLineCount + '\n';
        messageLines += message.content.body + '\n';

        return await this.socket.writeLine(messageLines);
    }

    async sendRequest<TResponse>(id: string, body: string): Promise<MessageContent | undefined> {
        let responseListener: ResponseListener;

        let msg = new Message(MessageKind.Request, id, new MessageContent(MessageStatus.Ok, body));
        let written = await this.writeMessage(msg) > 0;

        if (!written) {
            return undefined;
        }

        return new Promise<MessageContent>((resolve) => {
            let queue = this.requestAwaiterQueues.get(id);

            if (queue === undefined) {
                queue = [];
                this.requestAwaiterQueues.set(id, queue);
            }

            responseListener = (response) => {
                resolve(response);
            };
            queue.push(responseListener);
        });
    }
}

export class Client implements Disposable {
    identity: string;
    projectDir: string;
    projectMetadataDir: string;
    godotVersion: string;
    metaFilePath: string;
    messageHandler: IMessageHandler;
    logger: ILogger;

    fsWatcher?: chokidar.FSWatcher;
    metaFileModifiedTime?: Date;

    metadata?: GodotIdeMetadata;
    isDisposed: boolean = false;

    peer?: Peer;

    constructor(identity: string, godotProjectDir: string, godotVersion: string, messageHandler: IMessageHandler, logger: ILogger) {
        this.identity = identity;
        this.messageHandler = messageHandler;
        this.logger = logger;

        this.projectDir = godotProjectDir;
        this.godotVersion = godotVersion;
        if (semver.intersects(godotVersion, GODOT_VERSION_3)) {
            this.projectMetadataDir = path.join(godotProjectDir, '.mono', 'metadata');
        } else { // GODOT_VERSION_4+
            this.projectMetadataDir = path.join(godotProjectDir, '.godot', 'mono', 'metadata');
        }

        this.metaFilePath = path.join(this.projectMetadataDir, GodotIdeMetadata.defaultFileName);
    }

    getGodotProjectDir(): string {
        return this.projectDir;
    }

    isConnected(): boolean {
        return !this.isDisposed && this.peer !== undefined && this.peer.isConnected;
    }

    dispose() {
        this.isDisposed = true;
        this.fsWatcher?.close();
        this.peer?.dispose();
    }

    start(): void {
        this.startWatching();

        if (this.isDisposed || this.isConnected()) {
            return;
        }

        if (!fs.existsSync(this.metaFilePath)) {
            this.logger.logInfo('There is no Godot Ide Server running');
            return;
        }

        // Check to store the modified time. Needed for the onMetaFileChanged check to work.
        if (!this.metaFileModifiedTimeChanged()) {
            return;
        }

        const metadata = this.readMetadataFile();

        if (metadata !== undefined && metadata !== this.metadata) {
            this.metadata = metadata;
            this.connectToServer();
        }
    }

    async connectToServer(): Promise<void> {
        if (this.peer !== undefined && this.peer.isConnected) {
            this.logger.logError('Attempted to connect to Godot Ide Server again when already connected');
            return;
        }

        const attempts = 3;
        let attemptsLeft = attempts;

        while (attemptsLeft-- > 0) {
            if (attemptsLeft < (attempts - 1)) {
                this.logger.logInfo(`Waiting 3 seconds... (${attemptsLeft + 1} attempts left)`);
                await timeout(5000);
            }

            const socket = new CustomSocket();

            this.logger.logInfo('Connecting to Godot Ide Server');

            try {
                await socket.connect(this.metadata!.port, 'localhost');
            }
            catch (err) {
                this.logger.logError('Failed to connect to Godot Ide Server', err as Error);
                continue;
            }

            this.logger.logInfo('Connection open with Godot Ide Server');

            this.peer?.dispose();
            this.peer = new Peer(socket, new ClientHandshake(), this.messageHandler, this.logger);

            if (!await this.peer.doHandshake(this.identity)) {
                this.logger.logError('Handshake failed');
                this.peer.dispose();
                continue;
            }

            await this.peer.process();

            this.logger.logInfo('Connection closed with Ide Client');

            return;
        }

        this.logger.logInfo(`Failed to connect to Godot Ide Server after ${attempts} attempts`);
    }

    startWatching(): void {
        this.fsWatcher = chokidar.watch(this.metaFilePath);
        this.fsWatcher.on('add', path => this.onMetaFileChanged());
        this.fsWatcher.on('change', path => this.onMetaFileChanged());
        this.fsWatcher.on('unlink', path => this.onMetaFileDeleted());
    }

    metaFileModifiedTimeChanged(): boolean {
        const stats = fs.statSync(this.metaFilePath);
        if (this.metaFileModifiedTime !== undefined &&
            stats.mtime.valueOf() === this.metaFileModifiedTime.valueOf()) {
            return false;
        }
        this.metaFileModifiedTime = stats.mtime;
        return true;
    }

    onMetaFileChanged(): void {
        if (this.isDisposed) {
            return;
        }

        if (!fs.existsSync(this.metaFilePath)) {
            return;
        }

        // Check the modified time to discard some irrelevant changes
        if (!this.metaFileModifiedTimeChanged()) {
            return;
        }

        const metadata = this.readMetadataFile();

        if (metadata !== undefined && metadata !== this.metadata) {
            this.metadata = metadata;
            this.connectToServer();
        }
    }

    onMetaFileDeleted(): void {
        if (this.isConnected() || !fs.existsSync(this.metaFilePath)) {
            return;
        }

        const metadata = this.readMetadataFile();

        if (metadata !== undefined) {
            this.metadata = metadata;
            this.connectToServer();
        }
    }

    readMetadataFile(): GodotIdeMetadata | undefined {
        const buffer = fs.readFileSync(this.metaFilePath);
        const metaFileContent = buffer.toString('utf-8');
        const lines = metaFileContent.split('\n');

        if (lines.length < 2) {
            return undefined;
        }

        const port: number = parseInt(lines[0]);
        const editorExecutablePath = lines[1];

        if (isNaN(port)) {
            return undefined;
        }

        return new GodotIdeMetadata(port, editorExecutablePath);
    }
}

class GodotIdeMetadata {
    port: number;
    editorExecutablePath: string;

    static readonly defaultFileName = 'ide_messaging_meta.txt';

    constructor(port: number, editorExecutablePath: string) {
        this.port = port;
        this.editorExecutablePath = editorExecutablePath;
    }

    equals(other: GodotIdeMetadata): boolean {
        return this.port === other.port && this.editorExecutablePath === other.editorExecutablePath;
    }
}

function escapeRegex(s: string): string {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

class ClientHandshake implements IHandshake {
    readonly clientHandshakeBase: string = `${Peer.clientHandshakeName},Version=${Peer.protocolVersionMajor}.${Peer.protocolVersionMinor}.${Peer.protocolVersionRevision}`;
    readonly serverHandshakePattern: RegExp = new RegExp(escapeRegex(Peer.serverHandshakeName) + /,Version=([0-9]+)\.([0-9]+)\.([0-9]+),([_a-zA-Z][_a-zA-Z0-9]{0,63})/.source);

    getHandshakeLine(identity: string): string {
        return `${this.clientHandshakeBase},${identity}`;
    }

    isValidPeerHandshake(handshake: string, logger: ILogger): [boolean, string | undefined] {
        let match = this.serverHandshakePattern.exec(handshake);

        if (match === null) {
            return [false, undefined];
        }

        let serverMajor = parseInt(match[1], 10);
        if (isNaN(serverMajor) || Peer.protocolVersionMajor !== serverMajor) {
            logger.logDebug('Incompatible major version: ' + match[1]);
            return [false, undefined];
        }

        let serverMinor = parseInt(match[2], 10);
        if (isNaN(serverMinor) || Peer.protocolVersionMinor < serverMinor) {
            logger.logDebug('Incompatible minor version: ' + match[2]);
            return [false, undefined];
        }

        let serverRevision = parseInt(match[3], 10);
        if (isNaN(serverRevision)) {
            logger.logDebug('Incompatible revision build: ' + match[3]);
            return [false, undefined];
        }

        let identity = match[4];

        return [true, identity];
    }
}

interface IHandshake {
    getHandshakeLine(identity: string): string;
    isValidPeerHandshake(handshake: string, logger: ILogger): [boolean, string | undefined];
}

export interface IMessageHandler {
    handleRequest(peer: Peer, id: string, content: MessageContent, logger: ILogger): Promise<MessageContent>;
}

export interface ILogger {
    logDebug(message: string): void;
    logInfo(message: string): void;
    logWarning(message: string): void;
    logError(message: string): void;
    logError(message: string, e: Error): void;
}

class Message {
    kind: MessageKind;
    id: string;
    content: MessageContent;

    constructor(kind: MessageKind, id: string, content: MessageContent) {
        this.kind = kind;
        this.id = id;
        this.content = content;
    }

    toString(): string {
        return `${this.kind} | ${this.id}`;
    }
}

enum MessageKind {
    Request,
    Response
}

export enum MessageStatus {
    Ok,
    RequestNotSupported,
    InvalidRequestBody
}

export class MessageContent {
    status: MessageStatus;
    body: string;

    constructor(status: MessageStatus, body: string) {
        this.status = status;
        this.body = body;
    }
}

class DecodedMessage {
    kind?: MessageKind;
    id?: string;
    status?: MessageStatus;
    body: string = '';
    pendingBodyLines?: number;

    clear(): void {
        this.kind = undefined;
        this.id = undefined;
        this.status = undefined;
        this.body = '';
        this.pendingBodyLines = undefined;
    }

    toMessage(): Message | undefined {
        if (this.kind === undefined || this.id === undefined || this.status === undefined ||
            this.pendingBodyLines === undefined || this.pendingBodyLines > 0) {
            return undefined;
        }

        return new Message(this.kind, this.id, new MessageContent(this.status, this.body));
    }
}

enum MessageDecoderState {
    Decoding,
    Decoded,
    Errored
}

function tryParseEnumCaseInsensitive<T>(enumObj: T, value: string): T[keyof T] | undefined {
    let key = Object.keys(enumObj).find(key => key.toLowerCase() === value.toLowerCase());
    if (key === undefined) {
        return undefined;
    }
    return enumObj[<keyof T>key];
}

class MessageDecoder {
    readonly decodingMessage: DecodedMessage = new DecodedMessage();

    decode(messageLine: string): [MessageDecoderState, Message | undefined] {
        if (this.decodingMessage.kind === undefined) {
            let kind = tryParseEnumCaseInsensitive(MessageKind, messageLine);
            if (kind === undefined) {
                this.decodingMessage.clear();
                return [MessageDecoderState.Errored, undefined];
            }
            this.decodingMessage.kind = kind;
        } else if (this.decodingMessage.id === undefined) {
            this.decodingMessage.id = messageLine;
        } else if (this.decodingMessage.status === undefined) {
            let status = tryParseEnumCaseInsensitive(MessageStatus, messageLine);
            if (status === undefined) {
                this.decodingMessage.clear();
                return [MessageDecoderState.Errored, undefined];
            }
            this.decodingMessage.status = status;
        } else if (this.decodingMessage.pendingBodyLines === undefined) {
            let pendingBodyLines = parseInt(messageLine);
            if (isNaN(pendingBodyLines)) {
                this.decodingMessage.clear();
                return [MessageDecoderState.Errored, undefined];
            }
            this.decodingMessage.pendingBodyLines = pendingBodyLines;
        } else {
            if (this.decodingMessage.pendingBodyLines > 0) {
                this.decodingMessage.body += messageLine + '\n';
                this.decodingMessage.pendingBodyLines -= 1;
            } else {
                let decodedMessage = this.decodingMessage.toMessage();
                this.decodingMessage.clear();
                return [MessageDecoderState.Decoded, decodedMessage];
            }
        }

        return [MessageDecoderState.Decoding, undefined];
    }
}
