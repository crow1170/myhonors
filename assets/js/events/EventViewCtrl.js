'use strict';

angular.module('myhonorsEvents').controller('EventViewCtrl', ['$scope', '$routeParams', '$timeout', '$location', '$window', 'FirebaseIO', 'FirebaseCollection', 'RSVPService', 'CommentService', 'apikey_google', function ($scope, $routeParams, $timeout, $location, $window, FirebaseIO, FirebaseCollection, RSVPService, CommentService, apikey_google) {
	var mapLoaded = false;
	var eventRef = FirebaseIO.child('events/' + $routeParams.eventId);
	var discussionRef = eventRef.child('comments');
	$scope.rsvp = RSVPService;
	$scope.userComment = '';

	/* MAP FUNCTIONALITY */

	$window.initializeMap = function() {
		var latLng = new google.maps.LatLng($scope.event.location.lat, $scope.event.location.long);
		// we use parseFloat() here so we can add the offset (otherwise the offset concatenates since the object is a string)
		var latLngOffset = new google.maps.LatLng($scope.event.location.lat, parseFloat($scope.event.location.long) + 0.0015);

		var mapOptions = {
			zoom: 18,
			center: latLngOffset,
			mapTypeId: google.maps.MapTypeId.SATELLITE
		};

		var map = new google.maps.Map(document.getElementById("map_canvas"), mapOptions);

		// use the FIU map overlays
		var buildingsLayer = new google.maps.KmlLayer('http://sites.fiu.edu/emap/layers/Buildings.kmz', 
			{suppressInfoWindows: true, preserveViewport: true}
		);

		buildingsLayer.setMap(map);

		var marker = new google.maps.Marker({
			position: latLng,
			map: map,
			title: $scope.event.location.name
		});
	}

	$scope.renderMap = function(location) {	
		return '<iframe width="950" height="300" frameborder="0" scrolling="no" marginheight="0" marginwidth="0" src="' + location + '"></iframe>';
	}

	/* LOAD EVENT DATA AND INITIALIZE MAP */

	eventRef.on('value', function(snapshot) {
		if (snapshot.val() === null) {
			// event was deleted, do nothing
			return;
		}

		$timeout(function() {
			$scope.event = snapshot.val();
			$scope.event.id = snapshot.name();
			$scope.event.rsvps = snapshot.child('rsvps').numChildren();
		});

		// this way we don't reload the script everytime the event changes
		if (!mapLoaded) {
			// asynchronously load the Google Maps API script
			var script = document.createElement("script");
			script.type = "text/javascript";
			script.src = "https://maps.googleapis.com/maps/api/js?key=" + apikey_google + "&sensor=false&callback=initializeMap";
			document.body.appendChild(script);

			mapLoaded = true;
		}
	});

	/* COMMENT FUNCTIONALITY */

	$scope.comments = FirebaseCollection(discussionRef, {metaFunction: function(doAdd, data) {
		// get comment data
		FirebaseIO.child('comments/' + data.name()).once('value', function(commentSnapshot) {
			if (commentSnapshot.val() === null) {
				// comment was deleted, do nothing
				return;
			}

			// get user data, based off userId property of comment
			var userId = commentSnapshot.child('author').val();
			FirebaseIO.child('user_profiles/' + userId).once('value', function(userSnapshot) {
				if (userSnapshot.val() === null) {
					// user was deleted
					doAdd(commentSnapshot, {author: {fname: '[deleted]'}});
				} else {
					// now we have everything we want, so execute doAdd() with the final combined data
					doAdd(commentSnapshot, {author: userSnapshot.val()});
				}
			})
		})
	}});

	$scope.addComment = function() {
		CommentService.create($scope.userComment, discussionRef, function(error) {
			if (error) {} // TODO: broadcast message to user
		});
		$scope.userComment = '';
	};

	// provides a property to set the orderBy predicate for the comments (.current)
	// and a function to get the value as a text string for the view (.getCurrent())
	$scope.sortComments = {
		current: '-date',
		getCurrent: function() {
			switch (this.current) {
				case 'kudos':
					return 'Best';
				case 'date':
					return 'Oldest First';
				case '-date': // a negative sign in front of the predicate will reverse the array
				default:
					return 'Newest First';
			}
		}
	};

	/* RSVP FUNCTIONALITY */

	$scope.eventRSVPs = FirebaseCollection(eventRef.child('rsvps'), {metaFunction: function(doAdd, data) {
		FirebaseIO.child('user_profiles/' + data.name()).once('value', function(userSnapshot) {
			doAdd(userSnapshot);
		});
	}});

	/ * ADMIN FUNCTIONALITY */

	if ($scope.user.auth.isEventMod) {
		$scope.doDelete = function() {
			// remove event reference from all RSVPs, Comments, Swipes, etc.
			eventRef.child('comments').once('value', function(snapshot) {
				snapshot.forEach(function(childSnapshot) {
					// get the comment
					var commentId = childSnapshot.name();
					FirebaseIO.child('comments/' + commentId).once('value', function(commentSnapshot) {
						// get the user who posted the comment and delete it from their history
						// then delete the comment itself
						FirebaseIO.child('user_profiles/' + commentSnapshot.child('author').val() + '/comments/' + commentId).remove();
						commentSnapshot.ref().remove();
					});
				});
			});
			

			// finally, remove the event itself
			FirebaseIO.child('events/' + $scope.event.id).remove();

			// close the modal
			$('#deleteEventModal').modal('hide');

			// redirect to main page
			$location.path('#/dashboard');
		};
	}

}]);