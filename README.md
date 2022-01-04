# Custom Midi Mixer plugin for automatically scorekeeping my slippi games

This project is unlikely going to work for anyone else without modification tbh. It is a plugin for the software [Midi Mixer](https://www.midi-mixer.com/). 

Connects to an [8wr.io scoreboard](http://8wr.io/).

Made this for use on [my twitch channel](https://twitch.tv/jaggernaut/). If you're really interested in getting something like this working for yourself I might be able to help.

Is it necessry for this to be a midi mixer plugin? No, but this way I don't need to run any extra applications. Also I get to control it with my midi device.

### todo:
- Support offline game scorekeeping
  - Track players by port or something
  - Player names are going to need to be input elsewhere
- If possible support spectating games
  - No idea how slippi spectating works but this might be possible
- Have it count sets ending after a bo3/bo5/boX

# Demo
https://user-images.githubusercontent.com/5661214/148137405-21d5fa8a-ef4d-4132-bb05-124bd2b7e3f0.mp4

This package uses:
- [midi-mixer-plugin](https://github.com/midi-mixer/midi-mixer-plugin)
- [slippi-js](https://github.com/project-slippi/slippi-js)
- [chokidar](https://github.com/paulmillr/chokidar)
- [lodash](https://github.com/lodash/lodash)
- [firebase](https://github.com/firebase/firebase-js-sdk)
