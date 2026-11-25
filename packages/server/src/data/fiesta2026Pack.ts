export interface FiestaLevelSeed {
  orderIndex: number;
  title: string;
  clueText: string;
  locationHint: string;
  answer: string;
  targetLat: number;
  targetLng: number;
  triggerRadiusMeters: number;
  durationSecs?: number;
  isFinal: boolean;
  socialLinks: Array<{ platform: string; url: string }>;
  hints: Array<{ text: string; penaltyMins: number }>;
}

/**
 * Official Fiesta 2026 ("Who Am I?") 13-Clue Sequential Pool + 14th Final Location.
 * Each team visits 10 unique clues via round-robin + alternating prime stride (+1 / +5 mod 13),
 * then unlocks Stage 11: Sports Complex Hotspot + Bleachers Rendezvous.
 */
export const FIESTA_2026_PACK: FiestaLevelSeed[] = [
  {
    orderIndex: 1,
    title: 'Ghost in the Highlights',
    clueText:
      'Our target left a trace inside the official Instagram Highlights. Beware: six Highlights are decoys. Find the one Highlight that repeatedly tags an anonymous burner account, check its bio, and enter the burner username (without @).',
    locationHint: 'Proceed to the SDMCET Main Entry / Admin Plaza.',
    answer: 'trace_sdmcet',
    targetLat: 15.4303,
    targetLng: 75.0129,
    triggerRadiusMeters: 25,
    isFinal: false,
    socialLinks: [{ platform: 'Instagram', url: 'https://instagram.com' }],
    hints: [
      { text: 'Check Story Highlights right below the main profile bio.', penaltyMins: 2 },
      { text: 'Six Highlights are decoys; one repeatedly tags a single burner account.', penaltyMins: 4 },
      { text: 'The burner bio mentions early morning college arrivals.', penaltyMins: 6 },
    ],
  },
  {
    orderIndex: 2,
    title: '08:45 AM Departure',
    clueText:
      '@trace_sdmcet posted a public Snap story filmed at 8:45 AM right here among the parked buses. Ignore the buses—zoom into the corner of the notebook visible in frame and enter the repository name.',
    locationHint: 'Navigate to the SDMCET College Bus Parking bay.',
    answer: 'stage3',
    targetLat: 15.4295,
    targetLng: 75.0127,
    triggerRadiusMeters: 25,
    isFinal: false,
    socialLinks: [{ platform: 'Snapchat', url: 'https://www.snapchat.com' }],
    hints: [
      { text: 'Open the 8:45 AM public Snap from @trace_sdmcet.', penaltyMins: 2 },
      { text: 'Look at the bottom/corner margin of the frame, not the parked buses.', penaltyMins: 4 },
      { text: 'Enter the final repository slug after anon-sdmcet/.', penaltyMins: 6 },
    ],
  },
  {
    orderIndex: 3,
    title: 'Commit History',
    clueText:
      'Inspect the commit history and .gitignore of anon-sdmcet/stage3. Read the first word of each commit message to locate where inside this workshop the physical tag is hidden, or enter the primary machine type listed in .gitignore.',
    locationHint: 'Head to the Mechanical Engineering Workshop bay.',
    answer: 'lathe',
    targetLat: 15.4268,
    targetLng: 75.0158,
    triggerRadiusMeters: 25,
    isFinal: false,
    socialLinks: [{ platform: 'GitHub', url: 'https://github.com/anon-sdmcet/stage3' }],
    hints: [
      { text: 'Open the repository commit history tab.', penaltyMins: 2 },
      { text: 'Read only the first word of each commit message top-to-bottom.', penaltyMins: 4 },
      { text: 'Check .gitignore for *.lathe, *.cnc, and *.grease_stains.', penaltyMins: 6 },
    ],
  },
  {
    orderIndex: 4,
    title: 'Soundtrack Cipher',
    clueText:
      'Open the target’s public Spotify playlist. Read the first letter of each track title from top to bottom in exact order—the 13-letter acrostic is your passcode.',
    locationHint: 'Walk to the Central Library entrance steps.',
    answer: 'LIBRARYBRIDGE',
    targetLat: 15.4294,
    targetLng: 75.0135,
    triggerRadiusMeters: 25,
    isFinal: false,
    socialLinks: [{ platform: 'Spotify', url: 'https://open.spotify.com' }],
    hints: [
      { text: 'Open the public playlist linked here without shuffling.', penaltyMins: 2 },
      { text: 'Take the first letter of each song title from top to bottom.', penaltyMins: 4 },
      { text: 'Spells a two-word SDMCET Library landmark with no spaces.', penaltyMins: 6 },
    ],
  },
  {
    orderIndex: 5,
    title: 'Under the Beam',
    clueText:
      'Search beneath the lower support beam of the Library Bridge for a laminated QR micro-card. Scan it to open the secret Drive archive and submit the folder passcode token inside.',
    locationHint: 'Move onto/beneath the SDMCET Library Bridge structure.',
    answer: 'BEAMKEY',
    targetLat: 15.4290,
    targetLng: 75.0139,
    triggerRadiusMeters: 25,
    isFinal: false,
    socialLinks: [],
    hints: [
      { text: 'Inspect the underside of the lower structural support beam.', penaltyMins: 2 },
      { text: 'Look for a taped laminated QR micro-card.', penaltyMins: 4 },
      { text: 'Scan the QR and read the passcode inside the Drive archive.', penaltyMins: 6 },
    ],
  },
  {
    orderIndex: 6,
    title: 'Corrupted Cache',
    clueText:
      'The linked Google Drive folder is packed with corrupted PDF decoys. Ignore the broken PDFs—find the single intact raw camera image shot near Car Parking and enter its exact filename (without .jpg).',
    locationHint: 'Proceed to the Car Parking West Bay.',
    answer: 'IMG_7742',
    targetLat: 15.4285,
    targetLng: 75.0136,
    triggerRadiusMeters: 25,
    isFinal: false,
    socialLinks: [{ platform: 'Google Drive', url: 'https://drive.google.com' }],
    hints: [
      { text: 'Do not waste time trying to repair the corrupted PDF files.', penaltyMins: 2 },
      { text: 'Look for the single viewable .jpg photo in the Drive folder.', penaltyMins: 4 },
      { text: 'Enter the IMG_XXXX filename without the extension.', penaltyMins: 6 },
    ],
  },
  {
    orderIndex: 7,
    title: 'Metadata Forensics',
    clueText:
      'Download the raw camera file IMG_7742.jpg (not a screenshot!) and inspect its EXIF metadata using exif.tools. Extract the hidden Facebook profile ID buried inside the Camera Comment field.',
    locationHint: 'Move to the Car Parking Exit / Temple Approach lane.',
    answer: 'anon_target_sdmcet',
    targetLat: 15.4281,
    targetLng: 75.0141,
    triggerRadiusMeters: 25,
    isFinal: false,
    socialLinks: [
      { platform: 'Google Drive (Raw Image)', url: 'https://drive.google.com' },
      { platform: 'EXIF Inspector', url: 'https://exif.tools' },
    ],
    hints: [
      { text: 'Screenshots strip EXIF—download the original IMG_7742.jpg file.', penaltyMins: 2 },
      { text: 'Upload the original photo into exif.tools.', penaltyMins: 4 },
      { text: 'Copy the ID string after id= inside the Camera Comment field.', penaltyMins: 6 },
    ],
  },
  {
    orderIndex: 8,
    title: '15-Second Intercept',
    clueText:
      'Open the pinned 15-second voicenote on the target’s Facebook profile. Listen closely to the audio cues—or inspect its Morse/DTMF/Spectrogram—to decode the hidden passcode word.',
    locationHint: 'Walk quietly behind the Campus Temple shrine.',
    answer: 'TEMPLE',
    targetLat: 15.4278,
    targetLng: 75.0144,
    triggerRadiusMeters: 25,
    isFinal: false,
    socialLinks: [{ platform: 'Facebook', url: 'https://www.facebook.com' }],
    hints: [
      { text: 'Check the pinned audio post at the top of the profile.', penaltyMins: 2 },
      { text: 'Use a spectrogram, slow-down, or Morse/DTMF decoder if needed.', penaltyMins: 4 },
      { text: 'Listen for temple bell chimes and footsteps behind the shrine.', penaltyMins: 6 },
    ],
  },
  {
    orderIndex: 9,
    title: 'Mirror Glass',
    clueText:
      'Inspect the high-contrast Instagram photo linked here. Zoom into the glass door reflection, flip the mirrored lettering back to normal, and match it against the glass entrance in front of you.',
    locationHint: 'Head to the Bosh Center for Innovation glass entrance.',
    answer: 'BOSH CENTER FOR INNOVATION',
    targetLat: 15.4287,
    targetLng: 75.0149,
    triggerRadiusMeters: 25,
    isFinal: false,
    socialLinks: [{ platform: 'Instagram', url: 'https://instagram.com' }],
    hints: [
      { text: 'Zoom in closely on the reflection in the glass door.', penaltyMins: 2 },
      { text: 'Flip the image horizontally to read the reversed letters.', penaltyMins: 4 },
      { text: 'Enter the 4-word innovation center name.', penaltyMins: 6 },
    ],
  },
  {
    orderIndex: 10,
    title: 'Ancient Roots',
    clueText:
      'Combine Part 1 of the riddle in the Instagram caption with Part 2 hidden in the burner’s comment below it. Stand beneath the Civil Dept Tree described and check the physical tag on the trunk.',
    locationHint: 'Proceed to the landmark tree beside the Civil Engineering Department.',
    answer: 'ROOTS26',
    targetLat: 15.4275,
    targetLng: 75.0160,
    triggerRadiusMeters: 25,
    isFinal: false,
    socialLinks: [{ platform: 'Instagram', url: 'https://instagram.com' }],
    hints: [
      { text: 'Read both the caption and the burner account comment reply.', penaltyMins: 2 },
      { text: '"Bridges & concrete" is Civil Dept; "ancient roots" points to the tree.', penaltyMins: 4 },
      { text: 'Inspect the tree trunk at eye level for the physical tag code.', penaltyMins: 6 },
    ],
  },
  {
    orderIndex: 11,
    title: '404 // Ghost Snapshot',
    clueText:
      'Visit https://sdmcet-anon.github.io/trace — live it displays "404 // TRACE WIPED". Rewind the page on the Wayback Machine (web.archive.org) to recover the archived System Log and enter the 5-digit RECORD_ID.',
    locationHint: 'Walk toward the MBA Parking area.',
    answer: '88392',
    targetLat: 15.4269,
    targetLng: 75.0151,
    triggerRadiusMeters: 25,
    isFinal: false,
    socialLinks: [
      { platform: 'Target URL (/trace)', url: 'https://sdmcet-anon.github.io/trace' },
      {
        platform: 'Wayback Machine',
        url: 'https://web.archive.org/web/*/https://sdmcet-anon.github.io/trace',
      },
    ],
    hints: [
      { text: 'The live URL is intentionally replaced with a 404 decoy.', penaltyMins: 2 },
      { text: 'Paste the URL into web.archive.org to inspect the archived snapshot.', penaltyMins: 4 },
      { text: 'Copy the 5-digit number shown next to RECORD_ID #.', penaltyMins: 6 },
    ],
  },
  {
    orderIndex: 12,
    title: 'Half-Cut Fragment',
    clueText:
      'The digital half of a torn poster is uploaded on the burner Facebook page; its matching physical half is pinned on the Alumni bulletin board right in front of you. Align your screen beside the paper half to read the combined secret code.',
    locationHint: 'Proceed to the bulletin board near the Alumni Block.',
    answer: 'ALUMNI2026',
    targetLat: 15.4264,
    targetLng: 75.0147,
    triggerRadiusMeters: 25,
    isFinal: false,
    socialLinks: [{ platform: 'Facebook', url: 'https://www.facebook.com' }],
    hints: [
      { text: 'Open the torn poster image uploaded to the burner FB page.', penaltyMins: 2 },
      { text: 'Locate the matching paper half pinned on the Alumni noticeboard.', penaltyMins: 4 },
      { text: 'Hold your phone screen edge beside the paper tear to read the full code.', penaltyMins: 6 },
    ],
  },
  {
    orderIndex: 13,
    title: 'Process of Elimination',
    clueText:
      'Read the target’s Facebook check-in eliminating Mess (BH) and Mess Vis GH. Look around the SMT Bet Spots & GH junction where you arrived and enter the local check-in keyword.',
    locationHint: 'Head toward the SMT Bet Spots & GH corridor.',
    answer: 'SMT',
    targetLat: 15.4299,
    targetLng: 75.0154,
    triggerRadiusMeters: 25,
    isFinal: false,
    socialLinks: [{ platform: 'Facebook', url: 'https://www.facebook.com' }],
    hints: [
      { text: 'Read the latest check-in post carefully.', penaltyMins: 2 },
      { text: 'Mess (BH) and Mess Vis GH are ruled out as crowded decoys.', penaltyMins: 4 },
      { text: 'Verify the SMT junction marker right where you stand.', penaltyMins: 6 },
    ],
  },
  {
    orderIndex: 14,
    title: 'Final Location: Bleachers Rendezvous',
    clueText:
      'FINAL OBJECTIVE: Scan Wi-Fi networks near the Sports Complex courts (no mobile data needed) for the rogue hotspot SSID: WHO_AM_I_NODE — peak signal leads straight to the Target Volunteer holding a red clipboard on the bleachers! Present your single phone & College IDs, speak the passphrase aloud, and enter it below (or snap a live victory photo) to lock your finish time!',
    locationHint: 'Sprint to the SDMCET Sports Complex Courts & Bleachers!',
    answer: 'chacha wastegan huyyiyaa!',
    targetLat: 15.4305,
    targetLng: 75.0165,
    triggerRadiusMeters: 35,
    isFinal: true,
    socialLinks: [],
    hints: [
      { text: 'Open phone Wi-Fi scan near the courts to detect WHO_AM_I_NODE.', penaltyMins: 2 },
      { text: 'Look on the bleachers for the volunteer holding a red clipboard.', penaltyMins: 4 },
    ],
  },
];
