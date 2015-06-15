/// <reference path="typings/tsd.d.ts" />
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
/**
 * path.resolve
 * path.sep
 * path.relative
 */
var path = require('path');
var time = new Date;
var memfs;
(function (memfs) {
    // Like `fs.Stats`
    var Stats = (function () {
        function Stats() {
            //this.uid = process.getuid();
            this.uid = 0;
            //this.gid = process.getgid();
            this.gid = 0;
            this.rdev = 0;
            this.blksize = 4096;
            this.ino = 0;
            this.size = 0;
            this.blocks = 1;
            this.atime = time;
            this.mtime = time;
            this.ctime = time;
            this.birthtime = time;
            this.dev = 0;
            this.mode = 0;
            this.nlink = 0;
            this._isFile = false;
            this._isDirectory = false;
        }
        Stats.build = function (node) {
            var stats = new Stats;
            stats.uid = node.uid;
            stats.gid = node.gid;
            stats.atime = node.atime;
            stats.mtime = node.mtime;
            stats.ctime = node.ctime;
            if (node instanceof Directory) {
                stats._isDirectory = true;
            }
            else if (node instanceof File) {
                var data = node.getData();
                stats.size = data.length;
                stats._isFile = true;
            }
            return stats;
        };
        Stats.prototype.isFile = function () {
            return this._isFile;
        };
        Stats.prototype.isDirectory = function () {
            return this._isDirectory;
        };
        Stats.prototype.isSymbolicLink = function () {
            return false;
        };
        return Stats;
    })();
    memfs.Stats = Stats;
    var Node = (function () {
        function Node(relative, layer) {
            // File descriptor, negative, because a real file descriptors cannot be negative.
            this.fd = Node.fd--;
            this.uid = 0;
            //uid: number = process.getuid();
            this.gid = 0;
            //gid: number = process.getgid();
            this.atime = new Date;
            this.mtime = new Date;
            this.ctime = new Date;
            this.relative = relative;
            this.path = path.resolve(layer.mountpoint, relative);
            this.layer = layer;
        }
        Node.prototype.getData = function () {
            return '';
        };
        Node.prototype.setData = function (data) {
        };
        Node.prototype.getPath = function () {
            return this.path;
        };
        Node.prototype.stats = function () {
            return Stats.build(this);
        };
        Node.prototype.chown = function (uid, gid) {
            this.uid = uid;
            this.gid = gid;
        };
        Node.fd = -1;
        return Node;
    })();
    memfs.Node = Node;
    var File = (function (_super) {
        __extends(File, _super);
        function File() {
            _super.apply(this, arguments);
            // A "cursor" position in a file, where data will be written.
            this.position = 0;
        }
        File.prototype.getData = function () {
            return this.layer.files[this.relative];
        };
        File.prototype.setData = function (data) {
            this.layer.files[this.relative] = data.toString();
        };
        File.prototype.truncate = function (len) {
            if (len === void 0) { len = 0; }
            this.setData(this.getData().substr(0, len));
        };
        return File;
    })(Node);
    memfs.File = File;
    var Directory = (function (_super) {
        __extends(Directory, _super);
        function Directory() {
            _super.apply(this, arguments);
        }
        return Directory;
    })(Node);
    memfs.Directory = Directory;
    // A single `JSON` file of data mounted to a single mount point.
    // We have it so that we can store file contents in a single `.files` map.
    var Layer = (function () {
        function Layer(mountpoint, files) {
            /**
             * A map of relative file names to file contents 'string'.
             * {
             *  "test.txt": "...."
             *  "some/path/hello.txt": "world ..."
             * }
             */
            this.files = {};
            this.mountpoint = path.resolve(mountpoint);
            this.files = files;
        }
        return Layer;
    })();
    memfs.Layer = Layer;
    // A collection of layers, we have this, so that we override functions with `.attach()` only once.
    var Volume = (function () {
        function Volume() {
            this.memfs = memfs;
            // A flattened map of all nodes in this file system.
            this.flattened = {};
            // Collection of file layers, where the top ones override the bottom ones.
            this.layers = [];
            // A map of pseudo 'file descriptors' to LNodes.
            this.fds = {};
        }
        Volume.prototype.addDir = function (fullpath, layer) {
            var relative = path.relative(layer.mountpoint, fullpath);
            relative = relative.replace(path.sep, '/'); // Always use forward slashed in our virtual relative paths.
            var directory = new Directory(relative, layer);
            this.flattened[fullpath] = directory;
            this.fds[directory.fd] = directory;
            return directory;
        };
        Volume.prototype.addFile = function (fullpath, layer) {
            var relative = path.relative(layer.mountpoint, fullpath);
            relative = relative.replace(path.sep, '/'); // Always use forward slashed in our virtual relative paths.
            var node = new File(relative, layer);
            this.flattened[fullpath] = node;
            this.fds[node.fd] = node;
            var steps = relative.split('/');
            var dir_rel = '';
            for (var i = 0; i < steps.length - 1; i++) {
                dir_rel += steps[i] + (dir_rel ? path.sep : '');
                var dirpath = layer.mountpoint + path.sep + dir_rel;
                this.addDir(dirpath, layer);
            }
            return node;
        };
        Volume.prototype.addLayer = function (layer) {
            this.layers.push(layer);
            var mountpoint = path.resolve(layer.mountpoint) + path.sep;
            for (var relative in layer.files) {
                var filepath = relative.replace('/', path.sep);
                var fullpath = mountpoint + filepath;
                this.addFile(fullpath, layer);
            }
        };
        Volume.prototype.getFilePath = function (p) {
            var filepath = path.resolve(p);
            var node = this.getNode(filepath);
            return node ? node : null;
        };
        Volume.prototype.getNode = function (p) {
            var filepath = path.resolve(p);
            var node = this.flattened[filepath];
            if (!node)
                throw this.err404(filepath);
            return node;
        };
        Volume.prototype.getFile = function (p) {
            var node = this.getNode(p);
            if (node instanceof File)
                return node;
            else
                throw this.err404(node.path);
        };
        Volume.prototype.getDirectory = function (p) {
            var node = this.getNode(p);
            if (node instanceof Directory)
                return node;
            else
                throw Error('Directory not found: ' + node.path);
        };
        Volume.prototype.getByFd = function (fd) {
            var node = this.fds[fd];
            if (node)
                return node;
            else
                throw Error('Node file descriptor not found: ' + fd);
        };
        Volume.prototype.getLayerContainingPath = function (fullpath) {
            for (var i = 0; i < this.layers.length; i++) {
                var layer = this.layers[i];
                if (fullpath.indexOf(layer.mountpoint) === 0)
                    return layer;
            }
            return null;
        };
        Volume.prototype.err404 = function (file) {
            return Error('File not found: ' + file);
        };
        Volume.prototype.mountSync = function (mountpoint, files) {
            var layer = new Layer(mountpoint, files);
            this.addLayer(layer);
        };
        // TODO: Mount from URL:
        // TODO: `mount('/usr/lib', 'http://example.com/volumes/usr/lib.json', callback)`
        // TODO: ...also cache that it has been loaded...
        Volume.prototype.mount = function (mountpoint, files) {
        };
        // fs.readFile(filename[, options])
        Volume.prototype.readFileSync = function (file, opts) {
            var f = this.getFile(file);
            if (opts && opts.encoding) {
                return f.getData(); // String
            }
            else {
                var Buffer = require('buffer').Buffer;
                return new Buffer(f.getData()); // Buffer
            }
        };
        // fs.readFile(filename[, options], callback)
        Volume.prototype.readFile = function (file, opts, cb) {
            if (typeof opts == "function") {
                cb = opts;
                opts = {};
            }
            try {
                var f = this.getFile(file); // This throws, or succeeds.
                var self = this;
                process.nextTick(function () {
                    var result = self.readFileSync(file, opts);
                    cb(null, result);
                });
            }
            catch (e) {
                cb(e);
            }
        };
        // fs.realpathSync(path[, cache])
        Volume.prototype.realpathSync = function (file, opts) {
            var node = this.getNode(file); // This throws, or succeeds.
            return node.path;
        };
        // fs.realpath(path[, cache], callback)
        Volume.prototype.realpath = function (filepath, cache, callback) {
            if (typeof cache == "function")
                callback = cache;
            var self = this;
            process.nextTick(function () {
                try {
                    callback(null, self.realpathSync(filepath, cache));
                }
                catch (e) {
                    callback(e);
                }
            });
        };
        // fs.statSync(path)
        Volume.prototype.statSync = function (p) {
            var node = this.getNode(p);
            return node.stats();
        };
        // fs.lstatSync(path)
        Volume.prototype.lstatSync = function (p) {
            return this.statSync(p);
        };
        // fs.stat(path, callback)
        Volume.prototype.stat = function (p, callback) {
            var self = this;
            process.nextTick(function () {
                try {
                    callback(null, self.statSync(p));
                }
                catch (e) {
                    callback(e);
                }
            });
        };
        // fs.lstat(path, callback)
        Volume.prototype.lstat = function (p, callback) {
            this.stat(p, callback);
        };
        //fs.renameSync(oldPath, newPath)
        Volume.prototype.renameSync = function (oldPath, newPath) {
            var node = this.getNode(oldPath);
            oldPath = node.path;
            newPath = path.resolve(newPath);
            delete this.flattened[oldPath];
            this.flattened[newPath] = node;
            node.path = newPath;
            node.relative = path.relative(node.layer.mountpoint, newPath);
        };
        //fs.renameSync(oldPath, newPath[, cb])
        Volume.prototype.rename = function (oldPath, newPath, callback) {
            var self = this;
            process.nextTick(function () {
                try {
                    self.renameSync(oldPath, newPath);
                    if (callback)
                        callback(); // Docs: "Returns nothing or exception."
                }
                catch (e) {
                    if (callback)
                        callback(e);
                }
            });
        };
        //fs.fstatSync(fd)
        Volume.prototype.fstatSync = function (fd) {
            var node = this.getByFd(fd);
            return node.stats();
        };
        // fs.fstat(fd, callback)
        Volume.prototype.fstat = function (fd, callback) {
            var self = this;
            process.nextTick(function () {
                try {
                    callback(null, self.fstatSync(fd));
                }
                catch (e) {
                    callback(e);
                }
            });
        };
        // fs.writeFileSync(filename, data[, options])
        Volume.prototype.writeFileSync = function (filename, data, options) {
            var file = this.getFile(filename);
            file.setData(data);
        };
        // fs.writeFile(filename, data[, options], callback)
        Volume.prototype.writeFile = function (filename, data, options, callback) {
            if (typeof options == "function") {
                callback = options;
                options = null;
            }
            var self = this;
            process.nextTick(function () {
                try {
                    self.writeFileSync(filename, data, options);
                    if (callback)
                        callback();
                }
                catch (e) {
                    if (callback)
                        callback(e);
                }
            });
        };
        // fs.existsSync(filename)
        Volume.prototype.existsSync = function (filename) {
            try {
                this.getNode(filename);
                return true;
            }
            catch (e) {
                return false;
            }
        };
        // fs.exists(filename, callback)
        Volume.prototype.exists = function (filename, callback) {
            var self = this;
            process.nextTick(function () {
                callback(self.existsSync(filename));
            });
        };
        // fs.readdirSync(path)
        Volume.prototype.readdirSync = function (p) {
            var fullpath = path.resolve(p);
            // Check the path points into at least on of the directories our layers are mounted to.
            if (!this.getLayerContainingPath(fullpath))
                throw Error('Directory not found: ' + fullpath);
            var len = fullpath.length;
            var index = {};
            for (var nodepath in this.flattened) {
                if (nodepath.indexOf(fullpath) === 0) {
                    var relative = nodepath.substr(len + 1);
                    var sep_pos = relative.indexOf(path.sep);
                    if (sep_pos > -1)
                        relative = relative.substr(0, sep_pos);
                    if (relative)
                        index[relative] = 1;
                }
            }
            var files = [];
            for (var file in index)
                files.push(file);
            return files;
        };
        // fs.readdir(path, callback)
        Volume.prototype.readdir = function (p, callback) {
            var self = this;
            process.nextTick(function () {
                try {
                    callback(null, self.readdirSync(p));
                }
                catch (e) {
                    callback(e);
                }
            });
        };
        // fs.appendFileSync(filename, data[, options])
        Volume.prototype.appendFileSync = function (filename, data, options) {
            try {
                var file = this.getFile(filename);
                file.setData(file.getData() + data.toString());
            }
            catch (e) {
                var fullpath = path.resolve(filename);
                var layer = this.getLayerContainingPath(fullpath);
                if (!layer)
                    throw Error('Cannot create new file at this path: ' + fullpath);
                var file = this.addFile(fullpath, layer);
                file.setData(data.toString());
            }
        };
        // fs.appendFile(filename, data[, options], callback)
        Volume.prototype.appendFile = function (filename, data, options, callback) {
            if (typeof options == 'function') {
                callback = options;
                options = null;
            }
            var self = this;
            process.nextTick(function () {
                try {
                    self.appendFileSync(filename, data, options);
                    if (callback)
                        callback();
                }
                catch (e) {
                    if (callback)
                        callback(e);
                }
            });
        };
        // fs.unlinkSync(path)
        Volume.prototype.unlinkSync = function (filename) {
            var node = this.getNode(filename);
            delete node.layer.files[node.relative];
            delete this.flattened[node.path];
            delete this.fds[node.fd];
        };
        // fs.unlink(path, callback)
        Volume.prototype.unlink = function (filename, callback) {
            var self = this;
            process.nextTick(function () {
                try {
                    self.unlinkSync(filename);
                    if (callback)
                        callback();
                }
                catch (e) {
                    if (callback)
                        callback(e);
                }
            });
        };
        // fs.truncateSync(path, len)
        Volume.prototype.truncateSync = function (filename, len) {
            var file = this.getFile(filename);
            file.truncate(len);
        };
        // fs.truncate(path, len, callback)
        Volume.prototype.truncate = function (filename, len, callback) {
            var self = this;
            process.nextTick(function () {
                try {
                    self.truncateSync(filename, len);
                    if (callback)
                        callback();
                }
                catch (e) {
                    if (callback)
                        callback(e);
                }
            });
        };
        // fs.ftruncateSync(fd, len)
        Volume.prototype.ftruncateSync = function (fd, len) {
            var node = this.getByFd(fd);
            if (!(node instanceof File))
                this.err404(node.path);
            node.truncate(len);
        };
        // fs.ftruncate(fd, len, callback)
        Volume.prototype.ftruncate = function (fd, len, callback) {
            var self = this;
            process.nextTick(function () {
                try {
                    self.ftruncateSync(fd, len);
                    if (callback)
                        callback();
                }
                catch (e) {
                    if (callback)
                        callback(e);
                }
            });
        };
        // fs.chownSync(path, uid, gid)
        Volume.prototype.chownSync = function (filename, uid, gid) {
            var node = this.getNode(filename);
            node.chown(uid, gid);
        };
        // fs.chown(path, uid, gid, callback)
        Volume.prototype.chown = function (filename, uid, gid, callback) {
            var self = this;
            process.nextTick(function () {
                try {
                    self.chownSync(filename, uid, gid);
                    if (callback)
                        callback();
                }
                catch (e) {
                    if (callback)
                        callback(e);
                }
            });
        };
        // fs.fchownSync(fd, uid, gid)
        Volume.prototype.fchownSync = function (fd, uid, gid) {
            var node = this.getByFd(fd);
            node.chown(uid, gid);
        };
        // fs.fchown(fd, uid, gid, callback)
        Volume.prototype.fchown = function (fd, uid, gid, callback) {
            var self = this;
            process.nextTick(function () {
                try {
                    self.fchownSync(fd, uid, gid);
                    if (callback)
                        callback();
                }
                catch (e) {
                    if (callback)
                        callback(e);
                }
            });
        };
        // fs.lchownSync(path, uid, gid)
        Volume.prototype.lchownSync = function (filename, uid, gid) {
            this.chownSync(filename, uid, gid);
        };
        // fs.lchown(path, uid, gid, callback)
        Volume.prototype.lchown = function (filename, uid, gid, callback) {
            this.chown(filename, uid, gid, callback);
        };
        // fs.chmodSync(path, mode)
        Volume.prototype.chmodSync = function (filename, mode) {
            this.getNode(filename); // Does nothing, but throws if `filename` does not resolve to a node.
        };
        // fs.chmod(filename, mode, callback)
        Volume.prototype.chmod = function (filename, mode, callback) {
            var self = this;
            process.nextTick(function () {
                try {
                    self.chmodSync(filename, mode);
                    if (callback)
                        callback();
                }
                catch (e) {
                    if (callback)
                        callback(e);
                }
            });
        };
        // fs.fchmodSync(fd, mode)
        Volume.prototype.fchmodSync = function (fd, mode) {
            this.getByFd(fd);
        };
        // fs.fchmod(fd, mode, callback)
        Volume.prototype.fchmod = function (fd, mode, callback) {
            var self = this;
            process.nextTick(function () {
                try {
                    self.fchmodSync(fd, mode);
                    if (callback)
                        callback();
                }
                catch (e) {
                    if (callback)
                        callback(e);
                }
            });
        };
        // fs.lchmodSync(path, mode)
        Volume.prototype.lchmodSync = function (filename, mode) {
            this.chmodSync(filename, mode);
        };
        // fs.lchmod(path, mode, callback)
        Volume.prototype.lchmod = function (filename, mode, callback) {
            this.chmod(filename, mode, callback);
        };
        // fs.rmdirSync(path)
        Volume.prototype.rmdirSync = function (p) {
            var dir = this.getDirectory(p);
            delete this.flattened[dir.path];
            delete this.fds[dir.fd];
        };
        // fs.rmdir(path, callback)
        Volume.prototype.rmdir = function (p, callback) {
            var self = this;
            process.nextTick(function () {
                try {
                    self.rmdirSync(p);
                    if (callback)
                        callback();
                }
                catch (e) {
                    if (callback)
                        callback(e);
                }
            });
        };
        // fs.openSync(path, flags[, mode])
        Volume.prototype.openSync = function (p, flags, mode) {
            var file = this.getFile(p);
            return file.fd;
        };
        // fs.open(path, flags[, mode], callback)
        Volume.prototype.open = function (p, flags, mode, callback) {
            if (typeof mode == 'function') {
                callback = mode;
                mode = 0666;
            }
            var self = this;
            process.nextTick(function () {
                try {
                    callback(null, self.openSync(p, flags, mode));
                }
                catch (e) {
                    callback(e);
                }
            });
        };
        // fs.utimesSync(path, atime, mtime)
        Volume.prototype.utimesSync = function (filename, atime, mtime) {
            var node = this.getNode(filename);
            node.atime = atime;
            node.mtime = mtime;
        };
        // fs.utimes(path, atime, mtime, callback)
        Volume.prototype.utimes = function (filename, atime, mtime, callback) {
            var self = this;
            process.nextTick(function () {
                try {
                    callback(null, self.utimesSync(filename, atime, mtime));
                }
                catch (e) {
                    callback(e);
                }
            });
        };
        // fs.futimesSync(fd, atime, mtime)
        Volume.prototype.futimesSync = function (fd, atime, mtime) {
            var node = this.getByFd(fd);
            node.atime = atime;
            node.mtime = mtime;
        };
        // fs.futimes(fd, atime, mtime, callback)
        Volume.prototype.futimes = function (fd, atime, mtime, callback) {
            var self = this;
            process.nextTick(function () {
                try {
                    callback(null, self.futimesSync(fd, atime, mtime));
                }
                catch (e) {
                    callback(e);
                }
            });
        };
        // fs.accessSync(path[, mode])
        Volume.prototype.accessSync = function (filename, mode) {
            // fs.F_OK | fs.R_OK | fs.W_OK | fs.X_OK
            // Everything passes, as long as a node exists.
            this.getNode(filename);
        };
        // fs.access(path[, mode], callback)
        Volume.prototype.access = function (filename, mode, callback) {
            if (typeof mode == 'function') {
                callback = mode;
                mode = 7; // fs.F_OK | fs.R_OK | fs.W_OK | fs.X_OK
            }
            var self = this;
            process.nextTick(function () {
                try {
                    self.accessSync(filename, mode);
                    callback();
                }
                catch (e) {
                    callback(e);
                }
            });
        };
        // fs.closeSync(fd)
        Volume.prototype.closeSync = function (fd) {
            this.getNode(fd);
        };
        // fs.close(fd, callback)
        Volume.prototype.close = function (fd, callback) {
            var self = this;
            process.nextTick(function () {
                try {
                    self.closeSync(fd);
                    if (callback)
                        callback();
                }
                catch (e) {
                    if (callback)
                        callback(e);
                }
            });
        };
        // fs.mkdirSync(path[, mode])
        Volume.prototype.mkdirSync = function (p, mode) {
            var fullpath = path.resolve(p);
            var layer = this.getLayerContainingPath(fullpath);
            if (!layer)
                throw Error('Cannot create directory at this path: ' + fullpath);
            this.addDir(fullpath, layer);
        };
        // fs.mkdir(path[, mode], callback)
        Volume.prototype.mkdir = function (p, mode, callback) {
            if (typeof mode == 'function') {
                callback = mode;
                mode = 0777;
            }
            var self = this;
            process.nextTick(function () {
                try {
                    self.mkdirSync(p, mode);
                    if (callback)
                        callback();
                }
                catch (e) {
                    if (callback)
                        callback(e);
                }
            });
        };
        // fs.writeSync(fd, data[, position[, encoding]])
        // fs.writeSync(fd, buffer, offset, length[, position])
        Volume.prototype.writeSync = function (fd, data, position, encoding) {
            var file = this.getByFd(fd);
            if (!(file instanceof File))
                throw Error('Is not a file: ' + file.path);
            if (typeof position == 'undefined')
                position = file.position;
            var Buffer = require('buffer').Buffer;
            if (!(data instanceof Buffer)) {
                data = data.toString(); // Docs: "If data is not a Buffer instance then the value will be coerced to a string."
                var cont = file.getData();
                cont = cont.substr(0, position) + data + cont.substr(position + data.length);
                file.setData(cont);
                file.position = position + data.length;
                //return data.length;
                var Buffer = require('buffer').Buffer;
                return Buffer.byteLength(data, encoding);
            }
            else {
                data = data.toString();
            }
        };
        return Volume;
    })();
    memfs.Volume = Volume;
})(memfs || (memfs = {}));
module.exports = memfs;