# Podcasts ISL Videos Directory

This directory contains the final ISL (Indian Sign Language) videos for various podcasts.

## Folder Structure

```
public/podcasts/
├── pm-modi-mann-ki-baat/     # Final ISL videos for PM Modi: Mann Ki Baat podcast
│   ├── episode-1.mp4
│   ├── episode-2.mp4
│   └── ...
├── [future-podcast-name]/    # Future podcast folders can be added here
└── README.md                 # This file
```

## Usage

- Each podcast has its own dedicated folder
- Final ISL videos are saved in their respective podcast folders
- Video files should be named descriptively (e.g., episode-1.mp4, episode-2.mp4)
- All videos should be in MP4 format for web compatibility

## Adding New Podcasts

To add a new podcast:
1. Create a new folder with the podcast name (use kebab-case)
2. Add the podcast to the sidebar menu in `src/app/page.tsx`
3. Implement the podcast content page
4. Save final ISL videos in the corresponding folder

## Current Podcasts

- **PM Modi: Mann Ki Baat** - `pm-modi-mann-ki-baat/`