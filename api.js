var spashttp = require("spas-http")
	, _ = require("underscore")._
  	, url = "https://api.smugmug.com/services/api/json/1.3.0/?method="
;


//
// ## Custom - These do not have equivelants in the SmugMug API
//
exports["custom"] = {
	
	getAlbumsWithPhotos: function(params, credentials, cb) { 
		
		params.url = url + "smugmug.albums.get";
		
		spashttp.request(params, credentials, function( err, albums ) {
			
			var n = albums.Albums.length;
			
			_.each(albums.Albums, function( obj, key) {
				
				params.url = url + "smugmug.images.get" + "&Heavy=true&AlbumID=" + obj.id + "&AlbumKey=" + obj.Key + "&APIKey="+params.APIKey;
				
				spashttp.request(params, credentials, function( err, photos ) {
					n = n - 1;
					albums.Albums[key].Images = photos.Album.Images;
					albums.size += photos.size;
					if (n === 0) {
						cb( null, albums );
					}
				});
			});
		});	
	},
	
}
