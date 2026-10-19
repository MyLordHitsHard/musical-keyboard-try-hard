// Song library: simple, public-domain melodies (right hand). Format: NOTE[:beats], phrases split by "|".
(function () {
  const PT = window.PT;
  PT.SONGS = [
    {
      id: 'mary', title: 'Mary Had a Little Lamb', level: 1, tonic: 0,
      tip: 'Only 3 notes for most of it (E D C). Thumb on C, finger 2 on D, finger 3 on E.',
      text: 'E4 D4 C4 D4 E4 E4 E4:2 | D4 D4 D4:2 E4 G4 G4:2 | E4 D4 C4 D4 E4 E4 E4 E4 | D4 D4 E4 D4 C4:4',
    },
    {
      id: 'twinkle', title: 'Twinkle Twinkle Little Star', level: 1, tonic: 0,
      tip: 'Uses the C-position plus A. Stretch finger 5 from G to A, or shift your hand.',
      text: 'C4 C4 G4 G4 A4 A4 G4:2 | F4 F4 E4 E4 D4 D4 C4:2 | G4 G4 F4 F4 E4 E4 D4:2 | G4 G4 F4 F4 E4 E4 D4:2 | C4 C4 G4 G4 A4 A4 G4:2 | F4 F4 E4 E4 D4 D4 C4:2',
    },
    {
      id: 'ode', title: 'Ode to Joy (Beethoven)', level: 1, tonic: 0,
      tip: 'Almost all stepwise — your hand never has to move. Great first "real" tune.',
      text: 'E4 E4 F4 G4 G4 F4 E4 D4 | C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2 | E4 E4 F4 G4 G4 F4 E4 D4 | C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2',
    },
    {
      id: 'saints', title: 'When the Saints Go Marching In', level: 2, tonic: 0,
      tip: 'Thumb on C, then C-E-F-G uses fingers 1-3-4-5.',
      text: 'C4 E4 F4 G4:4 | C4 E4 F4 G4:4 | C4 E4 F4 G4:2 E4:2 C4:2 E4:2 D4:4 | E4 E4 D4 C4:3 C4 E4 G4:2 G4 F4:3 | E4 F4 G4:2 E4:2 C4:2 D4:2 C4:4',
    },
    {
      id: 'jingle', title: 'Jingle Bells (chorus)', level: 2, tonic: 0,
      tip: 'Lots of repeated E — keep the finger relaxed and bounce from the wrist.',
      text: 'E4 E4 E4:2 E4 E4 E4:2 | E4 G4 C4:1.5 D4:0.5 E4:4 | F4 F4 F4:1.5 F4:0.5 F4 E4 E4 E4:0.5 E4:0.5 | E4 D4 D4 E4 D4:2 G4:2 | E4 E4 E4:2 E4 E4 E4:2 | E4 G4 C4:1.5 D4:0.5 E4:4 | F4 F4 F4:1.5 F4:0.5 F4 E4 E4 E4:0.5 E4:0.5 | G4 G4 F4 D4 C4:4',
    },
    {
      id: 'birthday', title: 'Happy Birthday', level: 2, tonic: 0,
      tip: 'Starts on G, ends on C. The big jump up (G to the high G) is the tricky bit — look before you leap.',
      text: 'G4:0.75 G4:0.25 A4 G4 C5 B4:2 | G4:0.75 G4:0.25 A4 G4 D5 C5:2 | G4:0.75 G4:0.25 G5 E5 C5 B4 A4:2 | F5:0.75 F5:0.25 E5 C5 D5 C5:2',
    },
    {
      id: 'furelise', title: 'Für Elise (opening, right hand)', level: 3, tonic: 9,
      tip: 'Fingers 2-1 rock between E and D#. Then thumb jumps down to start the arpeggio.',
      text: 'E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1.5 | C4:0.5 E4:0.5 A4:0.5 B4:1.5 | E4:0.5 G#4:0.5 B4:0.5 C5:1.5 | E4:0.5 E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1.5 | C4:0.5 E4:0.5 A4:0.5 B4:1.5 | E4:0.5 C5:0.5 B4:0.5 A4:2',
    },
    {
      id: 'rowboat', title: 'Row, Row, Row Your Boat', level: 2, tonic: 0,
      tip: '"Merrily merrily" is four quick groups of three — C5 G4 E4 C4 each repeated.',
      text: 'C4 C4 C4:0.75 D4:0.25 E4 | E4:0.75 D4:0.25 E4:0.75 F4:0.25 G4:2 | C5:0.33 C5:0.33 C5:0.34 G4:0.33 G4:0.33 G4:0.34 E4:0.33 E4:0.33 E4:0.34 C4:0.33 C4:0.33 C4:0.34 | G4:0.75 F4:0.25 E4:0.75 D4:0.25 C4:2',
    },
  ];

  // Parse a song text into phrases of steps: [{notes:[midi], dur}]
  PT.parseSong = function (text) {
    return text.split('|').map((ph) =>
      ph.trim().split(/\s+/).filter(Boolean).map((tok) => {
        const [n, d] = tok.split(':');
        return { notes: [PT.theory.parseNote(n)], dur: d ? parseFloat(d) : 1 };
      })
    );
  };
})();
