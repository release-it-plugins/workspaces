const fs = require('fs');
const detectNewline = require('detect-newline');
const detectIndent = require('detect-indent');

const DETECT_TRAILING_WHITESPACE = /\s+$/;

const jsonFiles = new Map();

module.exports = class JSONFile {
  static for(path) {
    if (jsonFiles.has(path)) {
      return jsonFiles.get(path);
    }

    let jsonFile = new this(path);
    jsonFiles.set(path, jsonFile);

    return jsonFile;
  }

  constructor(filename) {
    let contents = fs.readFileSync(filename, { encoding: 'utf8' });

    this.filename = filename;
    this.pkg = JSON.parse(contents);
    this.lineEndings = detectNewline(contents);
    this.indent = detectIndent(contents).amount;

    let trailingWhitespace = DETECT_TRAILING_WHITESPACE.exec(contents);
    this.trailingWhitespace = trailingWhitespace ? trailingWhitespace : '';
  }

  write() {
    let contents = JSON.stringify(this.pkg, null, this.indent).replace(/\n/g, this.lineEndings);

    fs.writeFileSync(this.filename, contents + this.trailingWhitespace, { encoding: 'utf8' });
  }
};
