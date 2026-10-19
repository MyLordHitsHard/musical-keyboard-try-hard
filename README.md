# 🎹 Piano Try-Hard

A daily piano practice app for a complete beginner with a **Casio CT-X870IN** (or any USB-MIDI keyboard).
It reads your key presses over the USB cable, checks every note, and adapts so you can see improvement in days.

There's nothing to install: it's plain HTML/JS that runs in **Chrome or Edge**.

## Start in 2 minutes

1. Plug the USB cable (the square "printer" plug) into the **USB** port on the back of the Casio and into your laptop. Windows 10/11 and macOS need no driver.
2. Download this repo (green **Code** button → **Download ZIP**) and unzip it.
3. Double-click `index.html`. It must open in **Chrome or Edge**. Firefox and Safari can't read MIDI keyboards.
4. Click **Allow** when the browser asks about MIDI devices. The pill at the top right turns green: 🎹 CASIO USB-MIDI.
5. Press **▶ Start today's session**.

> If double-clicking doesn't connect, run a tiny local server in the folder: `python -m http.server 8000`, then open <http://localhost:8000>.
>
> No keyboard nearby? Use the computer keys **A W S E D F T G Y H U J K** (= C to C; **Z/X** change octave), or click the on-screen keys.

On the keyboard: keep **auto-accompaniment / rhythm OFF** while practising, and use a plain piano tone (Tone 001).

## What's inside

| Area | Drills | What you'll see improving |
|---|---|---|
| 🗺 **Keyboard map** | *Find the note*: 6 levels, from C-D-E up to exact octaves | Seconds per note (e.g. 4 s → 1 s) |
| ✋ **Fingers** | 8 five-finger patterns (including Indian **alankars**) in 6 positions, for the left hand, right hand and both hands mirrored; 9 scales with correct thumb-under fingering | Best **clean** tempo (BPM) and evenness % |
| 🎼 **Chords** | *Chord shapes* (8 levels unlocking 40+ chords); *One-minute changes*; *Progressions* (I–V–vi–IV and others in any key, with smooth voicings) | Seconds per chord, chord changes per minute |
| 👂 **Ears** | *Echo*: hear a tune, play it back (11 levels, 1→6 notes, any key); *Scale-note feeling* (Sa Re Ga…); *Intervals* with song references; *Major / minor* | Echo level, % correct |
| 🎵 **Songs** | 8 melodies, each in two modes: **Learn** (guided) and **By ear** (no notes shown; you copy each phrase) | Clean reps, accuracy by ear |
| 🧩 **Free play** | Names the chord you're holding live. Guesses the **key** of a song from the notes you pick out and suggests chords that fit | — |
| 📄 **Chord sheets** | Paste a chord sheet from any website. It pulls out the chords, can transpose to the **easiest key**, and turns them into a drill | — |
| 📈 **Progress** | Charts per day, personal bests, streak, XP and levels | — |

## How it's designed (and why)

- **Short mixed blocks.** The daily session is 10–30 minutes split into 4–6 blocks: fingers, keyboard map, chords, ear, song. Switching tasks keeps an ADHD brain engaged. Mixing skills ("interleaving") also tends to help long-term learning, even though repeating one thing *feels* more productive at the time ([Carter & Grahn 2016](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2016.01251/epub)).
- **Accuracy first, then tempo.** Each finger drill keeps a *goal tempo*. Play **3 clean reps in a row** at the goal and the goal goes up by 4 BPM. Struggle 4 times and it comes down. You always practise at the edge of your ability, and never so fast that you're rehearsing mistakes. This suits slower fine-motor learning: the app never rushes you.
- **Instant feedback.** Every key flashes green or red. Fingering numbers sit on the keys, and the next note is shown faintly.
- **Measurable progress.** Every drill logs numbers you can watch fall or rise: seconds per note, BPM, chord changes per minute, ear level.
- **Ear training for playing by ear.** *Echo* is the core: it trains exactly what you do when you work out a song (hear → find on keys). Notes are taught in relation to a home note (Sa / Do), the "functional" approach. After you answer, the note resolves home so you feel its pull.
- **Chords for chord sheets.** Chord shapes, one-minute changes and progressions, plus the sheet importer, cover the path from "what's an Am?" to playing a song from a chords website.

## Suggested roadmap

- **Weeks 1–2:** Find the note → level 4. Five-finger patterns, both hands. Echo levels 1–3. Mary, Twinkle, Ode to Joy.
- **Weeks 3–4:** C F G Am Dm Em under 3 s each. One-minute changes 20+. Echo with 2–3 notes. Play the songs **by ear**.
- **Month 2:** All major/minor chords. I–V–vi–IV in C, G, D, F with the left-hand bass note. C/G/F scales.
- **Month 3+:** Echo with 4–6 notes in any key. Use Free play to work out songs you know. Play from chord sheets.

## Your data

Progress is stored in your browser (localStorage) on this laptop. Use **Settings → Export progress** for backups, or to move to another computer.

## Files

```
index.html        app shell
css/style.css     styles (light & dark)
js/theory.js      notes, sargam, chords, scales, key detection, chord-sheet parser
js/core.js        event bus, storage/XP, synth & metronome, MIDI + computer-keyboard input
js/ui.js          on-screen piano, charts, helpers
js/songs.js       song library
js/drills.js      all drills
js/app.js         pages: home, daily session, library, free play, chords, progress, settings
```
