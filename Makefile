SOLUTION_DIR = "./GodotDebugSession/"

GODOT_DEBUG_SESSION_RELEASE = "$(SOLUTION_DIR)/bin/Release/GodotDebugSession.exe"
GODOT_DEBUG_SESSION_DEBUG = "$(SOLUTION_DIR)/bin/Debug/GodotDebugSession.exe"

all: vsix
	@echo "vsix created"

vsix: build
	./node_modules/.bin/vsce package

publish: build
	./node_modules/.bin/vsce publish

build: $(GODOT_DEBUG_SESSION_RELEASE) tsc
	@echo "build finished"

build-debug: $(GODOT_DEBUG_SESSION_DEBUG) tsc
	@echo "build finished"

tsc:
	node_modules/.bin/tsc -p ./

$(GODOT_DEBUG_SESSION_RELEASE):
	msbuild /p:Configuration=Release $(SOLUTION_DIR)/GodotDebugSession.sln

$(GODOT_DEBUG_SESSION_DEBUG):
	msbuild /p:Configuration=Debug $(SOLUTION_DIR)/GodotDebugSession.sln

clean:
	msbuild /t:Clean $(SOLUTION_DIR)/GodotDebugSession.sln
