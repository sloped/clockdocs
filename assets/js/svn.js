angular.module('Clockdoc.Utils')
.factory('Svn', ['$q', 'FileSystem', function($q) {

	var nativeSvnApp = 'com.clockwork.svn';
	var svnRoot = 'svn+ssh://svn.pozitronic.com/svnroot';

	var listeners = {
		'error'     : [],
		'cancel'    : [],
		'executing' : [],
		'read'      : [],
		'checkout'  : [],
		'info'      : [],
		'commit'    : [],
		'update'    : []
	};

	return {
		on: function(events, callback) {
			var events = events.split(' ');
			events.forEach(function(event) {
				listeners[event].push(callback);
			});
		},

		fire: function(event) {
			if (!listeners[event]) {
				console.warn('Undefined event', event);
				return;
			}

			var args = Array.prototype.splice.call(arguments, 1);
			var self = this;
			listeners[event].forEach(function(callback) {
				// Wrapped in timeout to ensure asynchronous firing
				setTimeout(function() {
					callback.apply(self, args);
				}, 0);
			});
		},

		parseInfo: function(response) {
			var data = angular.fromJson(response);
			var info = data.response;
			var lines = info.split('\n');
			var values = {};
			lines.forEach(function(line) {
				var colon = line.indexOf(':');
				var key = line.substr(0, colon).trim();
				var value = line.substr(colon + 1).trim();
				if (key && key.length) {
					values[key] = value;
				}
			});
			return values;
		},

		info: function(svnPath) {
			var self = this;
			var args = ['svn', 'info', svnPath];

			return self.exec(args)
			.then(function(response) {
				var values = self.parseInfo(response);
				self.fire('info', values);
			})
			.catch(function(e) {
				self.fire('error', e);
			});
		},

		fireWithInfo: function(event, result) {
			var self = this;
			var args = ['svn', 'info', result.path];
			// Add info to the checkout
			return self.exec(args)
			.then(function(response) {
				result.info = self.parseInfo(response);
				self.fire(event, result);
			})
			.catch(function(e) {
				self.fire('error', e);
			});
		},

		// svn+ssh://svn.pozitronic.com/svnroot/templates/rd-rd.json
		open: function(svnPath) {
			var self = this;
			var args = ['svn', 'cat', svnPath];
			return self.exec(args)
			.then(function(response) {
				var text = angular.fromJson(response);
				var result = {
					content: text && text.response,
					path: svnPath
				};
				return self.fireWithInfo('read', result);
			})
			.catch(function(e) {
				self.fire('error', e);
			});
		},

		// Allows the user to checkout a file. The callback
		// receives the contents, path, file entry and svn info
		checkout: function(svnPath) {
			var self = this,
				path = svnPath.replace(svnRoot, ''),
				dir = path.replace(/\\/g, '/').replace(/\/[^\/]*\/?$/, ''),
				file = path.split('/').reverse()[0];

			// @todo: get the user's preferred directory

			var run = function(args) {
				return function(response) {
					console.log('Received', response, 'Running', args);
					return self.exec(args);
				}
			}

			return self.exec(['rm', '-rf', '.' + dir])
			.then(run(['svn', 'co', '--depth=empty', svnRoot + dir]))
			.then(run(['svn', 'up', '--depth=empty', '.' + dir + '/' + file]))
			.then(run(['cat', '.' + dir + '/' + file]))
			.then(function(response) {
				var text = angular.fromJson(response);
				var result = {
					content: text && text.response,
					path: svnPath
				};
				return self.fireWithInfo('checkout', result);
			})
			.catch(function(e) {
				self.fire('error', e);
			});
		},

		commit: function(data, info) {
			var args = [
				'echo', angular.toJson(data), '|', // Pipe the file contents to svnmucc
				'svnmucc',
				'-r', info['Revision'], // Include revision # to prevent clobbering a newer version
				'put', '-', // Use '-' to indicate using STDIN
				info.URL,
				'-m', info['Message']
			];
			var self = this;
			return self.exec(args)
			.then(function(response) {
				self.fire('commit', response);
				console.log("committed!", response);
			}).
			catch(function(e) {
				self.fire('error', e);
			});
		},

		// Queues up the execution of a command and returns a promise
		exec: function(args) {
			var deferred = $q.defer();
			var self     = this;

			self.fire('executing', args);

			var resolveResponse = function(response) {
				if (chrome.runtime.lastError) {
					deferred.reject(chrome.runtime.lastError);
				}
				deferred.resolve(response);
			};

			chrome.runtime.sendNativeMessage(
				nativeSvnApp, 
				{ command: args },
				resolveResponse
			);

			return deferred.promise;
		}
	};
}]);
