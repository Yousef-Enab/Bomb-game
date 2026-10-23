// مولَّد بواسطة tools/make_sprites.py — أعد تشغيل السكربت بدل التعديل اليدوي.
export const SHEETS = {
 "player": {
  "url": "/sheet_player.png",
  "w": 64,
  "h": 64,
  "cols": 4,
  "rows": 8,
  "vis": {
   "x": 23,
   "y": 12,
   "w": 18,
   "h": 40
  },
  "foot": 51,
  "anim": {
   "south": {
    "row": 0,
    "ms": [
     200,
     200,
     200,
     200
    ]
   },
   "south-west": {
    "row": 1,
    "ms": [
     200,
     200,
     200,
     200
    ]
   },
   "west": {
    "row": 2,
    "ms": [
     200,
     200,
     200,
     200
    ]
   },
   "north-west": {
    "row": 3,
    "ms": [
     200,
     200,
     200,
     200
    ]
   },
   "north": {
    "row": 4,
    "ms": [
     200,
     200,
     200,
     200
    ]
   },
   "north-east": {
    "row": 5,
    "ms": [
     200,
     200,
     200,
     200
    ]
   },
   "east": {
    "row": 6,
    "ms": [
     200,
     200,
     200,
     200
    ]
   },
   "south-east": {
    "row": 7,
    "ms": [
     200,
     200,
     200,
     200
    ]
   }
  }
 },
 "archer": {
  "url": "/sheet_archer.png",
  "w": 80,
  "h": 80,
  "cols": 9,
  "rows": 3,
  "vis": {
   "x": 16,
   "y": 15,
   "w": 48,
   "h": 51
  },
  "foot": 65,
  "muzzle": [
   77,
   38
  ],
  "releaseFrame": 8,
  "faces": "east",
  "anim": {
   "reload": {
    "row": 0,
    "ms": [
     200,
     200,
     200,
     200,
     200,
     200,
     200,
     200,
     200
    ]
   },
   "idle": {
    "row": 1,
    "ms": [
     200,
     200,
     200,
     200
    ]
   },
   "shoot": {
    "row": 2,
    "ms": [
     200,
     200,
     200,
     200,
     200,
     200,
     200,
     200,
     200
    ]
   }
  }
 },
 "heart": {
  "url": "/heart.png",
  "w": 9,
  "h": 9,
  "cols": 2,
  "rows": 1,
  "generated": true,
  "frames": {
   "full": 0,
   "empty": 1
  }
 },
 "bomb": {
  "url": "/bomb.png",
  "w": 16,
  "h": 16,
  "cols": 3,
  "rows": 1,
  "generated": true,
  "anim": {
   "fuse": {
    "row": 0,
    "ms": [
     120,
     120,
     120
    ]
   }
  }
 },
 "arrow": {
  "url": "/arrow.png",
  "w": 16,
  "h": 7,
  "cols": 1,
  "rows": 1,
  "generated": true
 }
};
