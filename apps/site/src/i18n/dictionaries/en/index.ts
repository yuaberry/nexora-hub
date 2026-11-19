/** EN dictionary of the site — derived from the PT-BR shape (compile-checked). */
export const en = {
  'brand.name': 'NEXORA HUB',
  'brand.tagline': 'Your game library, in one place.',
  'brand.product': "NEXORA's game launcher.",

  'nav.download': 'Download',
  'planned.badge': 'Planned',
  'error.notFound.title': 'Page not found',
  'error.notFound.hint': 'The requested path does not exist on this site.',
  'error.notFound.back': 'Back to home',
  'settings.theme.label': 'Theme switch',
  'nav.docs': 'Documentation',
  'nav.faq': 'FAQ',

  'hero.title': 'All your games, in a single launcher',
  'hero.subtitle':
    'Unified library, smart search, verified downloads, save snapshots and play time measured for real. Built for PC gaming — Windows and Linux.',
  'hero.cta': 'Download for Linux',
  'hero.ctaSecondary': 'Read the docs',
  'hero.note': 'Linux (AppImage and .deb) · Windows and macOS coming soon',

  'features.title': 'What NEXORA HUB does today',
  'features.subtitle': 'Only what actually exists — no screen promises.',
  'features.library.title': 'Unified library',
  'features.library.desc':
    'Import the folders of the games you already own, keep favourites and find everything by name, acronym or just consonants.',
  'features.search.title': 'Smart search',
  'features.search.desc':
    'Type "l" and find League of Legends; type "mncft" and find Minecraft. Search understands syllables, vowels and consonants.',
  'features.time.title': 'Real play time',
  'features.time.desc':
    'The measurement comes from a real child process, with the exit code recorded. A crash is never mistaken for a normal session.',
  'features.downloads.title': 'Verified downloads',
  'features.downloads.desc':
    'Multi-connection engine with queue, pause and resume. No file is installed without the SHA-256 declared in its manifest.',
  'features.verify.title': 'Verify at any time',
  'features.verify.desc':
    'Security does not come from the source: it comes from the file. Recompute checksums of what is on your disk whenever you want.',
  'features.saves.title': 'Save snapshots',
  'features.saves.desc':
    'Versioned saves on your computer, with a restore that returns the exact contents. Cloud sync is a future phase.',
  'features.linux.title': 'Windows on Linux',
  'features.linux.desc':
    'Windows games run under Wine/Proton with a per-game prefix. Without Wine, the launcher says so instead of failing silently.',

  'planned.title': 'On the way',
  'planned.subtitle': 'Phases announced with the honesty seal — nothing here pretends to work.',
  'planned.friends': 'Friends, presence and chat',
  'planned.store': 'Store with official links',
  'planned.achievements': 'Achievements',
  'planned.overlay': 'In-game overlay',
  'planned.remote': 'Remote Play',
  'planned.bigpicture': 'Big Picture mode',
  'planned.ia': 'NEXORA AI',

  'how.title': 'How it works',
  'how.step1': 'Install the launcher and import the folders of the games you already have.',
  'how.step2': 'NEXORA HUB detects the executable and organises the library.',
  'how.step3': 'Play, track time, create save snapshots and verify files whenever you want.',

  'downloads.title': 'Download',
  'downloads.subtitle': 'Verified builds, with published SHA-256 checksums.',
  'downloads.linux': 'Linux (x64)',
  'downloads.appimage': 'AppImage',
  'downloads.deb': '.deb package',
  'downloads.windows': 'Windows (x64)',
  'downloads.macos': 'macOS',
  'downloads.soon': 'Coming soon',
  'downloads.soonHint': 'The multiplatform build is in the release pipeline.',
  'downloads.requirements': 'Requirements',
  'downloads.publishHint': 'Publishing is done via GitHub Release; the download link goes live with the first public release.',
  'downloads.requirementsText': 'Windows 10/11 or Linux (glibc 2.31+), 4 GB RAM, 500 MB disk.',

  'docs.title': 'Documentation',
  'docs.subtitle': 'NEXORA HUB knowledge base — getting started, sources, verification and legal position.',
  'docs.gettingStarted': 'Getting started',
  'docs.manifests': 'Source manifests',
  'docs.integrity': 'Integrity verification',
  'docs.saves': 'Saves and snapshots',
  'docs.legal': 'Legal position',
  'docs.api': 'API and community',

  'faq.title': 'Frequently asked questions',
  'faq.q1': 'Does NEXORA HUB distribute games?',
  'faq.a1':
    'No. The launcher reads the folders of the games you already have on your computer. NEXORA does not host or redistribute game content.',
  'faq.q2': 'Are the downloads safe?',
  'faq.a2':
    'Every downloaded file is verified against the SHA-256 declared in its manifest before installation, and can be re-checked at any time. The security measure is on the file, not on trust in the source.',
  'faq.q3': 'Do I need an account to use it?',
  'faq.a3':
    'No. The local library, search, verified downloads and save snapshots work without an account. Commenting and reviewing on the web requires a NEXORA account.',
  'faq.q4': 'Does it work on Linux?',
  'faq.a4':
    'Yes. Windows games run under Wine/Proton with a per-game prefix; without Wine installed, the launcher warns you instead of failing silently.',
  'faq.q5': 'Does my data go to the cloud?',
  'faq.a5':
    'Not at this stage. Save snapshots and play time stay on your computer. Cloud sync is a future phase and will be communicated when it exists.',
  'faq.q6': 'What is the software licence?',
  'faq.a6':
    'NEXORA HUB is proprietary software owned by NEXORA. The source code is not published at this stage.',

  'docs.getting.p1': 'Install NEXORA HUB (AppImage or .deb) and open the launcher. On first run the library is empty — that is honest: the launcher reads what you have, not what NEXORA distributes.',
  'docs.getting.p2': 'Use "Choose folder" to import the folders of games already installed. The launcher detects the main executable and refuses the folder when it finds no plausible candidate — telling you why.',
  'docs.getting.p3': 'From there the library organises your games: search by name, acronym or consonants, favourites, play time measured every session and save snapshots whenever you want to keep your progress.',
  'docs.manifests.p1': 'A download source is a .json file (manifest) describing what to download: URLs, paths, SHA-256 checksums, declared executables and a legal basis declaration.',
  'docs.manifests.p2': 'Without the legal basis declaration (basis, attestedBy, attestedAt), the manifest installation is refused by the software. Whoever installs the source declares its legal basis and answers for it.',
  'docs.manifests.p3': 'NEXORA does not host, redistribute or select manifests: the ones on your machine were installed by you or by the operator of your environment.',
  'docs.integrity.p1': 'No file is installed unless the SHA-256 declared in its manifest matches the downloaded content. Verification runs before the final rename.',
  'docs.integrity.p2': 'At any time, the Downloads tab lets you "Verify": checksums are recomputed on disk and compared with the declared ones. A changed, replaced or missing file is reported — the security measure is on the file, not on trust in the source.',
  'docs.saves.p1': 'Save snapshots are versioned copies of a save folder, with a monotonic revision that is never reused. Creating a snapshot copies the folder; restoring returns exactly the stored contents.',
  'docs.saves.p2': 'At this stage the save folder is the install folder — shown in the interface, not hidden. Per-game configurable folders are the next phase.',
  'docs.saves.p3': 'Cloud sync is a future phase: snapshots and play time stay on your computer, and the interface says so.',
  'docs.legal.p1': 'NEXORA HUB is a client: it reads the user local folders. NEXORA does not host or redistribute game content and does not implement, promise or document circumvention of protections (Denuvo) or anticheat.',
  'docs.legal.p2': 'Protected or store-linked games require a legitimate licence and, in many cases, the store official launcher. NEXORA HUB can launch the local executable, but does not guarantee a protected game works without the launcher it depends on.',
  'docs.legal.p3': 'Every source manifest declares its legal basis and whoever installed it answers for it. Integrity verification does not legitimise unlicensed content: it only tells the truth about what is on disk.',
  'docs.api.p1': 'The NEXORA HUB API serves authentication (password + MFA + rotating refresh), library, search, game sessions, unified sources and community (comments and reviews per game).',
  'docs.api.p2': 'Commenting and reviewing requires a session; deleting filters by the owner — another user resource returns 404, never 403. The review is one per user and game, and the aggregate is honest: real averages and null when a category has no votes.',
  'docs.api.p3': 'Full technical documentation for integrators is a future phase; this page describes what exists today.',

  'footer.rights': '© 2026 NEXORA. All rights reserved.',
  'footer.legal': 'Legal position',
  'footer.docs': 'Documentation',
  'footer.contact': 'Contact',
  'footer.contactValue': 'contact@nexora.local',
  'footer.builtWith': 'Built with our own theme tokens, in PT-BR and EN.',
} as const;