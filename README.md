# npm-audio-recorder
[![Build Status](https://travis-ci.org/Haojen/npm-audio-recorder.svg?branch=master)](https://travis-ci.org/Haojen/npm-audio-recorder)

Transfer audio streams using WebRTC and Websocket

## Install 
npm install audio-recorders

## Example

### Usually

```
  import AudioRecorders from 'audio-recorders'
  
   navigator.getUserMedia({audio: true}, (stream) => {
      const config = {
        exportAudio: 'wav'
      }
      
      this.recorder = new AudioRecorders(stream, config)
      
      this.recorder.onStreamProcessor = (buffer) => {}
      this.recorder.onReceiveAudioBlob = (blobs) => {}

      this.recorder.startRecord()
   })
```

### With Websocket

```
    this.recorder.onStreamProcessor = (buffer) => {
        Websocket.send(buffer)
    }
```


## Config

1. exportAudio: wav // If you want to export wav audio
>>>>>>> a6243866362765188d54b33ca57e575c1e09f905

## Methods

### startRecord
<<<<<<< HEAD
### stopRecord
=======
Start the recording

### stopRecord
Stop the recorder

### clear
Clean up the last recording cache

## Call back

### onStreamProcessor
Receiving audio stream, The size of each chunk is about `3084`

```onStreamProcessor(streamBuffers => () {})```

### onReceiveAudioBlob
Blob file generated after audio recording is complete

```onReceiveAudioBlob(audioBuffers => {})```
**You must configure the `exportAudio: wav` value to execute this method**




