/*global angular:false */
'use strict';

angular.module('Clockdoc.Controllers')
.controller('SvnCtrl', ['$scope', 'Svn', 'LocalStorage', function($scope, Svn, LocalStorage) {

	var RECENT_SVN_URLS = 'svn_recent_urls';
	var RECENT_SVN_URL_MAX = 10;

	// Load up the saved urls
	LocalStorage.get(RECENT_SVN_URLS)
	.then(function(urls) {
		$scope.recentSvnUrls = urls;
	});

	// Keeps track of the request url
	$scope.svn = {
		url: Svn.root
	};

	function rememberUrl() {
		var url = $scope.svn.url;

		if (!url) {
			return;
		}

		var urls = $scope.recentSvnUrls || [];
		urls.splice(0, 0, url);

		urls = urls.filter(function(e, i, a) {
			return a.lastIndexOf(e) === i;
		});

		urls = urls.slice(0, RECENT_SVN_URL_MAX);

		LocalStorage.set(RECENT_SVN_URLS, urls)
		.then(function() {
			$scope.recentSvnUrls = urls;
		});
	}

	Svn.test().then(function(res) {
		console.info(res);
		$scope.setSvnInstalled(true);
	}, function(res) {
		console.info(res);
		$scope.setSvnInstalled(false);
	});

	function svnError(e) {
		console.error('SVN error', e);
		$scope.warn('An SVN error occurred.', 'Check the console log for details.');
		$scope.setWorking(false);
	}

	function svnRead(file) {
		console.info('Read from SVN', file);

		Svn.info(file.remote.full)
		.then(function(info) {
			file.remote.revision = info.revision;
			$scope.setFile(file);

			rememberUrl(info.url);
		});
		try {
			var data = angular.fromJson(file.content);
			$scope.loadDoc(data);
			$scope.unwarn();
		}
		catch (e) {
			console.error('Error reading file', e, file);
			$scope.warn('File error', 'There was an error reading the SVN file. Check the console log for details');
		}
	}

	function svnCommitted(file) {
		$scope.setFile(file);
		$scope.warn('Committed', 'changes committed to SVN', 'success');
	}

	$scope.openSvn = function(skipCheck) {
		if (!skipCheck && $scope.docRootChanged) {
			return $scope.speedBump($scope.openSvn.bind(this, true));
		}
		$scope.setWorking(true);
		Svn.open($scope.svn.url)
			.then(svnRead, svnError)
			.then($scope.watchForChange, svnError);
	};

	$scope.checkout = function(skipCheck) {
		if (!skipCheck && $scope.docRootChanged) {
			return $scope.speedBump($scope.checkout.bind(this, true));
		}
		$scope.setWorking(true);
		Svn.checkout($scope.svn.url)
			.then(svnRead, svnError)
			.then($scope.watchForChange, svnError);
	};

	$scope.installSvn = function() {
		$scope.setWorking(true);
		Svn.install().then(function() {
			$scope.setWorking(false);
			$scope.svnInstalled = true;
		}, function() {
			// installation was cancelled
			$scope.setWorking(false);
		});
	};

	$scope.commit = function() {
		$scope.setWorking(true);
		$scope.files.current.content = angular.toJson($scope.rd, true);
		Svn.commit($scope.files.current, $scope.svn.message)
			.then(svnCommitted, svnError);
	};

	$scope.update = function() {
		$scope.setWorking(true);
		Svn.update($scope.files.current)
			.then(svnRead, svnError);
	};
}]);
