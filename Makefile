SOLUTION_DIR="./GodotDebugSession/"

GODOT_DEBUG_SESSION="./dist/GodotDebugSession/GodotDebugSession.exe"

all: package
	@echo "vsix created"

package: build
	./node_modules/.bin/vsce package

publish: build
	./node_modules/.bin/vsce publish

build: $(GODOT_DEBUG_SESSION) tsc
	@echo "build finished"

build-debug: $(GODOT_DEBUG_SESSION)-debug tsc-debug
	@echo "build finished"

tsc:
	./node_modules/.bin/tsc -p ./
	./node_modules/.bin/webpack --mode production

tsc-debug:
	./node_modules/.bin/tsc -p ./
	./node_modules/.bin/webpack --mode development

$(GODOT_DEBUG_SESSION):
	msbuild /p:Configuration=Release /restore $(SOLUTION_DIR)/GodotDebugSession.sln

$(GODOT_DEBUG_SESSION)-debug:
	msbuild /p:Configuration=Debug /restore $(SOLUTION_DIR)/GodotDebugSession.sln

clean:
	msbuild /t:Clean $(SOLUTION_DIR)/GodotDebugSession.sln
