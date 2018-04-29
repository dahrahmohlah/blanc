import { parseFile } from 'music-metadata'
import * as fs from 'fs'
import { posix, join } from 'path'
import mime from 'mime'
// console.log(mm)
const flatten = (arr, result = []) => {
  for (let i = 0, length = arr.length; i < length; i++) {
    const value = arr[i]
    if (Array.isArray(value)) {
      flatten(value, result)
    } else {
      result.push(value)
    }
  }
  return result
}

onmessage = (e) => {
  console.log(e)
  if (e.data) {
    if (e.data.command && e.data.command === 'index') {
      index(e.data.path)
    }
  }
}

function index (path) {
  console.log('Indexing:', path)
  // let resolves = []
  function innerIndex (path) {
    return new Promise((resolve, reject) => {
      let resolves = []
      if (fs.statSync(path).isDirectory()) {
        postMessage({
          command: 'currently-indexing',
          path: path
        })
        let dirContents = fs.readdirSync(path)
        let directories = dirContents.filter((item) => fs.statSync(join(path, item)).isDirectory())
        resolves = resolves.concat(directories.map((dir) => innerIndex(join(path, dir))))
        let files = dirContents.filter((item) => fs.statSync(join(path, item)).isFile() && mime.getType(item) && mime.getType(item).startsWith('audio'))
        files.forEach((file) => {
          let libraryItem = {}
          libraryItem.filePath = join(path, file)
          libraryItem.fileName = posix.basename(file)
          libraryItem.metadata = {}
          libraryItem.title = ''
          libraryItem.artist = ''
          libraryItem.artists = []
          libraryItem.albumArt = ''
          libraryItem.album = ''
          // libraryItem.lastIndexed = new Date()
          resolves.push(parseFile(join(path, file), { native: true }).then((metadata) => {
            libraryItem.title = metadata.common.title || ''
            libraryItem.artist = metadata.common.artist || ''
            libraryItem.artists = metadata.common.artists || []
            libraryItem.album = metadata.common.album || ''
          }).then(() => libraryItem).catch((e) => console.log('Couldn\'t index', file, e)))
        })
      }
      Promise.all(resolves).then((values) => resolve(values))
    })
  }
  innerIndex(path).then((items) => {
    items = flatten(items)
    let chunkLength = 30
    let posted = 0
    // console.log(items)
    while (posted < items.length) {
      let itemsToPost = items.slice(posted, posted + chunkLength)
      postMessage({
        command: 'add-items',
        items: itemsToPost
      })
      posted += chunkLength
      console.log(posted)
    }
    if (posted !== items.length) {
      console.log(items.length, posted, posted - items.length, posted - chunkLength, items.length - (posted - items.length))
      let itemsToPost = items.slice(items.length - (posted - items.length))
      postMessage({
        command: 'add-items',
        items: itemsToPost
      })
    }
    postMessage({
      command: 'finish-indexing'
    })
  })
}
