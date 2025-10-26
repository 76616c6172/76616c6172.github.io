.PHONY: all minify minify-html minify-css minify-js install-tools clean help

# Directories to exclude from minification
EXCLUDE_DIRS := node_modules .git xterm

# Find all files excluding certain directories
HTML_FILES := $(shell find . -name "*.html" $(foreach dir,$(EXCLUDE_DIRS),-not -path "./$(dir)/*"))
CSS_FILES := $(shell find . -name "*.css" $(foreach dir,$(EXCLUDE_DIRS),-not -path "./$(dir)/*"))
JS_FILES := $(shell find . -name "*.js" $(foreach dir,$(EXCLUDE_DIRS),-not -path "./$(dir)/*"))

# Colors for output
GREEN := \033[0;32m
BLUE := \033[0;34m
NC := \033[0m # No Color

all: minify

help:
	@echo "Available targets:"
	@echo "  make minify        - Minify all HTML, CSS, and JS files"
	@echo "  make minify-html   - Minify only HTML files"
	@echo "  make minify-css    - Minify only CSS files"
	@echo "  make minify-js     - Minify only JS files"
	@echo "  make install-tools - Install required minification tools"
	@echo "  make clean         - Remove backup files"
	@echo "  make help          - Show this help message"

install-tools:
	@echo "$(BLUE)Installing minification tools...$(NC)"
	npm install --save-dev html-minifier-terser csso-cli terser

minify: minify-html minify-css minify-js
	@echo "$(GREEN)✓ All files minified successfully!$(NC)"

minify-html:
	@echo "$(BLUE)Minifying HTML files...$(NC)"
	@for file in $(HTML_FILES); do \
		echo "  Minifying $$file"; \
		npx html-minifier-terser \
			--collapse-whitespace \
			--remove-comments \
			--remove-optional-tags \
			--remove-redundant-attributes \
			--remove-script-type-attributes \
			--remove-tag-whitespace \
			--use-short-doctype \
			--minify-css true \
			--minify-js true \
			-o $$file $$file; \
	done
	@echo "$(GREEN)✓ HTML files minified$(NC)"

minify-css:
	@echo "$(BLUE)Minifying CSS files...$(NC)"
	@for file in $(CSS_FILES); do \
		echo "  Minifying $$file"; \
		npx csso-cli -i $$file -o $$file; \
	done
	@echo "$(GREEN)✓ CSS files minified$(NC)"

minify-js:
	@echo "$(BLUE)Minifying JS files...$(NC)"
	@for file in $(JS_FILES); do \
		echo "  Minifying $$file"; \
		npx terser $$file -o $$file --compress --mangle; \
	done
	@echo "$(GREEN)✓ JS files minified$(NC)"

clean:
	@echo "$(BLUE)Cleaning up backup files...$(NC)"
	find . -name "*.bak" -type f -delete
	@echo "$(GREEN)✓ Cleanup complete$(NC)"

# Target to list files that will be minified (useful for dry-run)
list:
	@echo "HTML files to minify:"
	@echo "$(HTML_FILES)" | tr ' ' '\n'
	@echo ""
	@echo "CSS files to minify:"
	@echo "$(CSS_FILES)" | tr ' ' '\n'
	@echo ""
	@echo "JS files to minify:"
	@echo "$(JS_FILES)" | tr ' ' '\n'
