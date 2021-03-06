// import IndexerWorker from '@/indexer.worker'
import db from '@/library.db'
// import { cacheAlbumArt, cacheColors } from '@/lazy-loaders'
import Queue from 'queue'
import { promiseFiles } from 'node-dir'
import { parseFile } from 'music-metadata'
import { win32, posix, sep as pathSep } from 'path'
import * as mime from 'mime'
import { getLibrary, indexAlbums, getAlbums } from './lazy-loaders'
import store from '@/store'
import { cacheAlbumArt } from './lib/utils'

export async function removeFiles (libPath) {
  let r = new RegExp('^' + libPath)
  let songs = await db.find({ filePath: r }).execAsync()
  let currentlyPlaying = store.state.Music.currentlyPlaying
  let queue = store.state.Music.queue
  if (currentlyPlaying && songs.some(song => song.filePath === currentlyPlaying.filePath)) {
    store.commit('STOP_MUSIC')
  }
  let newQueue = queue.filter(song => !songs.some(removedSong => removedSong.filePath === song.filePath))
  store.commit('SET_QUEUE', newQueue)
  await db.removeAynsc({ filePath: r }, { multi: true })
  await getLibrary()
  await getAlbums(true)
}
export function getMetadata (file) {
  return parseFile(file, {native: false, duration: true})
}
export function indexFile (file) {
  let libraryItem = {}
  return getMetadata(file)
    .then(metadata => {
      libraryItem.filePath = file
      if (process.platform === 'win32') {
        libraryItem.fileName = win32.basename(file)
      } else {
        libraryItem.fileName = posix.basename(file)
      }

      libraryItem.title = ''
      libraryItem.artist = ''
      libraryItem.artists = []
      libraryItem.albumArt = ''
      libraryItem.album = ''
      libraryItem.duration = metadata.format.duration
      libraryItem.folderBasedAlbum = false
      libraryItem.title = metadata.common.title || libraryItem.fileName
      libraryItem.artist = metadata.common.artist || 'Unknown'
      libraryItem.artists = metadata.common.artists || ['Unknown']
      libraryItem.album = metadata.common.album || ''
      if (!libraryItem.album) {
        let sections = libraryItem.filePath.split(pathSep)
        libraryItem.album = sections[sections.length - 2]
        libraryItem.folderBasedAlbum = true
      }
      if (!libraryItem.album) {
        libraryItem.album = 'Unknown'
        libraryItem.folderBasedAlbum = false
      }
      let picture = metadata.common.picture && metadata.common.picture[0]
      let res = Promise.resolve()
      if (picture) {
        res
          .then(() => cacheAlbumArt(picture.format, picture.data))
          .then(path => {
            picture = undefined
            // console.log(libraryItem.fileName, path)
            libraryItem.albumArt = path
          })
          .catch((e) => {
            console.log('Error getting caching art for', file, e)
            // libraryItem.colors = undefined
          })
      }
      res = res.then(() => {
        return db.updateAsync({filePath: file}, libraryItem, {upsert: true})
      })
      return res
    })
}
export function addFiles (path, background = false) {
  return new Promise((resolve, reject) => {
    if (!background) store.commit('BEGIN_INDEXING')
    let indexDetails = {
      processed: 0,
      total: 0
    }
    let indexQueue = new Queue()
    indexQueue.concurrency = 16
    indexQueue.autostart = true
    let finish = () => {
      indexDetails.processed = 0
      indexDetails.total = 0
      let p = Promise.resolve()
      p.then(getLibrary)
      p.then(() => indexAlbums())
      p.then(() => {
        if (!background) store.commit('FINISH_INDEXING')
      })
      p.then(() => resolve())
      p.catch(e => {
        console.warn(e)
        if (!background) store.commit('FINISH_INDEXING')
        reject(e)
      })
    }
    indexQueue.on('end', finish)
    // indexQueue.on('success', (_, job) => {
    //   console.log('done with job', _)
    // })
    promiseFiles(path)
      .then((files) => files.filter(file => mime.getType(file) && mime.getType(file).startsWith('audio')))
      .then((files) => {
        indexDetails.total = files.length
        if (files.length === 0) {
          finish()
        }
        files.forEach(file => {
          indexQueue.push(cb => {
            return db.countAsync({filePath: file})
              .then((amount) => {
                if (amount === 0) {
                  return indexFile(file)
                    .then(() => {
                      indexDetails.processed++
                      // console.log(indexDetails)
                      if (!background) store.commit('UPDATE_INDEXING_PROGRESS', indexDetails)
                      cb()
                    }).catch((e) => {
                      console.warn('Error indexing', file, e)
                      cb()
                    })
                } else {
                  indexDetails.processed++
                  if (!background) store.commit('UPDATE_INDEXING_PROGRESS', indexDetails)
                  cb()
                }
              })
          })
        })
      }).catch((e) => console.warn(e))
  })
}
export default function index (path) {
  return new Promise((resolve, reject) => {
    store.commit('BEGIN_INDEXING')
    let indexDetails = {
      processed: 0,
      total: 0
    }
    let indexQueue = new Queue()
    indexQueue.concurrency = 16
    indexQueue.autostart = true
    let finish = () => {
      indexDetails.processed = 0
      indexDetails.total = 0

      store.commit('FINISH_INDEXING')
      getLibrary()
        .then(indexAlbums)
        .then(() => store.commit('FINISH_INDEXING'))
        .then(() => resolve())
        .catch(e => {
          console.warn(e)
          store.commit('FINISH_INDEXING')
          reject(e)
        })
    }
    indexQueue.on('end', finish)
    promiseFiles(path)
      .then((files) => files.filter(file => mime.getType(file) && mime.getType(file).startsWith('audio')))
      .then((files) => {
        indexDetails.total = files.length
        if (files.length === 0) {
          finish()
        }
        files.forEach(file => {
          indexQueue.push(cb => {
            return indexFile(file)
              .then(() => {
                indexDetails.processed++
                // console.log(indexDetails)
                store.commit('UPDATE_INDEXING_PROGRESS', indexDetails)
                cb()
              }).catch((e) => {
                console.warn('Error indexing', file, e)
                cb()
              })
          })
        })
      }).catch((e) => console.warn(e))
  })
}
