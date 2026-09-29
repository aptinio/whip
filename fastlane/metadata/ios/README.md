# iOS App Store screenshots

The English iPhone screenshots are frames from the iOS recordings used in the
launch video. The generator records each source clip and frame timestamp and
exports opaque PNGs for the existing 6.5-inch and 6.9-inch App Store media sets.

Regenerate from the repository root:

```sh
nix shell nixpkgs#ffmpeg --command node scripts/generate-ios-store-screenshots.cjs
```

The artwork is scaled proportionally, with only the small aspect-ratio difference
cropped. No device frame, captions, or interface elements are added. iPad footage
is not available in these recordings; the existing iPad store screenshots remain
in App Store Connect.
