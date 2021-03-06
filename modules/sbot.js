var pull = require('pull-stream')
var ssbKeys = require('ssb-keys')
//var ref = require('ssb-ref')
var Reconnect = require('pull-reconnect')
var path = require('path')
var config = require('ssb-config/inject')(process.env.ssb_appname)

var ssbKeys = require('ssb-keys')

var path = require('path')
var keys = config.keys = ssbKeys.loadOrCreateSync(path.join(config.path, 'secret'))
config.manifest = require(path.join(config.path, 'manifest.json'))


//uncomment this to use from browser...
//also depends on having ssb-ws installed.
//var createClient = require('ssb-lite')
var createClient = require('ssb-client')

var cache = CACHE = {}

module.exports = {
  gives: {
    sbot: {
      onClient: true,

      add: true,
      get: true,
      getLatest: true,
      createLogStream: true,
      createUserStream: true,
      links: true,
      progress: true,
      status: true,

      friends: {
        get: true
      },

      names: {
        get: true,
        getImages: true,
        getImageFor: true,
        getSignifier: true,
        getSignifies: true
      },
      blobs: {
        get: true,
        add: true,
        push: true
      },
      search: {
        query: true
      },
      private: {
        read: true
      },
      query: {
        read: true
      },
      identities: {
        main: true,
        list: true,
        create: true,
        publishAs: true
      }
    }
  },

  create: function (api) {

    var opts = config
    var sbot = null
    var connection_status = []
    var waiting = []
    var rec = {
      sync: function () {},
      async: function () {},
      source: function () {},
    }

    var rec = Reconnect(function (isConn) {
      function notify (value) {
        isConn(value);
      }

      config.remote = localStorage.remote

      createClient(keys, config, function (err, _sbot) {
        if(err) {
          console.log(err.stack)
          return notify(err)
        }
        sbot = _sbot
        while(waiting.length && sbot)
          waiting.shift()(sbot)
        sbot.on('closed', function () {
          sbot = null
          notify(new Error('closed'))
        })

        notify()
      })
    })

    //poll the sbot every 10 seconds, to ensure connection is maintained
    ;(function loop (err) {
      if(err) console.error(err)
      setTimeout(function () {
        var start = Date.now()
        if(sbot) sbot.whoami(function (err) {
          if(err) console.log('disconnect')
          else console.log('connected', Date.now()-start)
        })
      }, 10e3)
    })()

    var images = {}, names = {}

    return {
      sbot: {
        onClient: function (fn) {
          if(sbot) fn(sbot)
          else waiting.push(fn)
        },
        createLogStream: rec.source(function (opts) {
          return pull(
            sbot.createLogStream(opts),
            pull.through(function (e) {
              CACHE[e.key] = CACHE[e.key] || e.value
            })
          )
        }),
        createUserStream: rec.source(function (opts) {
          return pull(
            sbot.createUserStream(opts),
            pull.through(function (e) {
              CACHE[e.key] = CACHE[e.key] || e.value
            })
          )
        }),
        links: rec.source(function (opts) {
          return sbot.links(opts)
        }),
        add: rec.async(function (msg, cb) {
          if('function' !== typeof cb)
            throw new Error('cb must be function')
          sbot.add(msg, cb)
        }),
        get: rec.async(function (key, cb) {
          if('function' !== typeof cb)
            throw new Error('cb must be function')
          if(false && CACHE[key]) cb(null, CACHE[key])
          else sbot.get(key, function (err, value) {
            if(err) return cb(err)
            cb(null, CACHE[key] = value)
          })
        }),
        getLatest: rec.async(function (id, cb) {
          sbot.getLatest(id, cb)
        }),
        progress: rec.async(function (cb) {
          sbot.progress(cb)
        }),
        status: rec.async(function (cb) {
          sbot.status(cb)
        }),
        friends: {
          get: rec.async(function (opts, cb) {
            sbot.friends.get(opts, cb)
          })
        },
        names: {
          get: rec.async(function (opts, cb) {
            sbot.names.get(opts, cb)
          }),
          getImages: rec.async(function (opts, cb) {
            sbot.names.getImages(opts, cb)
          }),
          getImageFor: rec.async(function (opts, cb) {
            if(images[opts]) cb(null, images[opts])
            else
              sbot.names.getImageFor(opts, function (err, v) {
                if(err) cb(err)
                else cb(null, images[opts]= v)
              })
          }),
          getSignifier: rec.async(function (opts, cb) {
            sbot.names.getSignifier(opts, cb)
          }),
          getSignifies: rec.async(function (opts, cb) {
            sbot.names.getSignifies(opts, cb)
          })
        },
        blobs: {
          add: rec.sink(function (opts, cb) {
            return sbot.blobs.add(opts, cb)
          }),
          get: rec.source(function (opts) {
            return sbot.blobs.get(opts)
          }),
          push: rec.async(function (hash, cb) {
            sbot.blobs.push(hash, cb)
          })
        },
        search: {
          query: rec.source(function (opts) {
            return sbot.search.query(opts)
          })
        },
        private: {
          read: rec.source(function (opts) {
            return sbot.private.read(opts)
          })
        },
        query: {
          read: rec.source(function (opts) {
            return sbot.query.read(opts)
          })
        },
        identities: {
          main: rec.async(function (cb) {
            sbot.identities.main(cb)
          }),
          list: rec.async(function (cb) {
            sbot.identities.list(cb)
          }),
          publishAs: rec.async(function (opts, cb) {
            sbot.identities.publishAs(opts, cb)
          }),
          create: rec.async(function (cb) {
            sbot.identities.create(cb)
          })
        }

      }
    }
  }
}



