var spashttp = require("spas-http")
  , _ = require("underscore")._
;
var async = require('async');

var BASE_URL = 'https://api.smugmug.com/';

//
// ## Custom - These do not have equivelants in the SmugMug API
//
exports["custom"] = {

  getAlbumsWithPhotos: function(params, credentials, cb) {
    var url = BASE_URL + "services/api/json/1.3.0/?method=";
    params.url = url + "smugmug.albums.get";

    spashttp.request(params, credentials, function( err, albums ) {
      var result, error;
      if (!err) {

        var n = albums && albums.Albums ? albums.Albums.length : 0;

        _.each(albums.Albums, function( obj, key) {

          params.url = url + "smugmug.images.get" + "&Heavy=true&AlbumID=" + obj.id + "&AlbumKey=" + obj.Key + "&APIKey="+params.APIKey;

          spashttp.request(params, credentials, function( err, photos ) {
            n = n - 1;
            if (_.has(photos, 'Album')) {
              albums.Albums[key].Images = photos.Album.Images;
              albums.size += photos.size;
            }
            if (n === 0) {
              cb( null, albums );
            }
          });
        });
      } else {
        cb(error, {} );
      }
    });

  }

}

var ALBUM_IMAGES_EXPAND_CONFIG = {
  "filter": ["Caption", "FileName", "Keywords", "IsVideo", "ImageKey", "UploadKey"],
  "filteruri": ["ImageSizes"],
  "args": {
    "count": 9999
  },
  "expand": {
    "ImageSizes": {
      "filter": ["OriginalImageUrl", "LargestImageUrl"],
      "filteruri": []
    }
  }
}

var ALBUM_EXPAND_CONFIG = {
  "filter": ["Uri", "Name", "Description"],
  "filteruri": ["ParentFolders", "AlbumImages"],
  "expand": {
    "ParentFolders": {
      "filter": ["Name"],
      "filteruri": []
    },
    "AlbumImages": ALBUM_IMAGES_EXPAND_CONFIG
  }
}

/**
 * Expand Smugmug data into an array of albums.
 * @param {object} data The data returned from SmugMug.
 * @param {arary} into The array to store albums into.
 * @param {int} startAt The start index to store the albums into `into`.
 */
function expand(data, into, startAt) {
  var albums = data.Response.Album;
  var Expansions = data.Expansions;

  albums.forEach(function(album, index) {
    // Title is deprecated; use Name instead, but provide a fallback.
    album.Title = album.Name;

    var imagesUri = album.Uris.AlbumImages;
    var folderUri = album.Uris.ParentFolders;
    var ParentFolders = Expansions[folderUri].Folder;
    var parentCount = ParentFolders.length;
    var AlbumImage = Expansions[imagesUri].AlbumImage;
    var images = album.Images = [];

    // `ParentFolders` contains an array of path segment, but in reverse order.
    if (ParentFolders[parentCount-2]) {
      album.Category = ParentFolders[parentCount-2].Name;
    }
    if (ParentFolders[parentCount-3]) {
      album.SubCategory = ParentFolders[parentCount-3].Name;
    }

    if (!AlbumImage) {
      AlbumImage = [];
    }

    AlbumImage.forEach(function(image) {
      var sizesUri = image.Uris.ImageSizes
        , ImageSizes = Expansions[sizesUri].ImageSizes
        ;

      // Fallback to largest image available.
      image.OriginalURL = ImageSizes.OriginalImageUrl || ImageSizes.LargestImageUrl;

      var re = /,[\s]*$/;
      if (re.test(image.Keywords)) {
        image.Keywords += image.FileName;
      } else {
        image.Keywords += ', ' + image.FileName;
      }

      if (image.IsVideo) {
        image.EmbededVideo = "https://api.smugmug.com/services/embed/" + image.UploadKey + "_" + image.ImageKey;
      }

      images.push(image);
    });

    into[startAt + index] = album;
  });

  return albums;
}

function userAlbums(params, credentials, cb) {
  if (!params.NickName) {
    return cb(new Error('NickName param must be provided'));
  }
  if (!params.APIKey) {
    return cb(new Error('APIKey param must be provided'));
  }

  var userAlbumsParams = _.extend({
    "url": BASE_URL + "api/v2/user/" + params.NickName + "!albums",
    "_accept": "application/json",
    "_verbosity": 1,
    "_config": encodeURIComponent(JSON.stringify(ALBUM_EXPAND_CONFIG)),
    "MinimumImages": 1
  }, params);

  // Performs initial request with maximum allowed count to get the total.
  spashttp.request(userAlbumsParams, credentials, function(err, result) {
    if (err) {
      return cb(err);
    }

    var albums = [];
    // Expands the first response, storing from index 0.
    expand(result, albums, 0);
    var perPage = result.Response.Pages.Count;
    var total = result.Response.Pages.Total;
    var start = perPage + 1;
    // Calculates the list of pages to send requests.
    var pages = [];
    while (start < total) {
      pages.push({
        start: start,
        count: perPage
      });
      start += perPage;
    }

    // async.forEach/3 does not guarantee the same order as the source,
    // so we have to add returned albums at individual index.
    async.forEach(pages, function requestPage(page, callback) {
      var pageParams = _.extend(userAlbumsParams, page);

      spashttp.request(pageParams, credentials, function expandResult(err, data) {
        if (err) {
          return callback(err);
        }
        // Pushs new albums starting at the page's index.
        expand(data, albums, page.start - 1);
        callback(null);
      })
    }, function returnResult(err) {
      cb(err, {
        "Albums": albums,
        "Total": total
      })
    });
  });
}

exports['v2'] = {
  "user!albums": userAlbums
}
