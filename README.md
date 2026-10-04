# PrivaTube

[![GitHub Stars](https://img.shields.io/github/stars/CCypri3n/PrivaTube?style=social)](https://github.com/CCypri3n/PrivaTube)
[![GitHub Forks](https://img.shields.io/github/forks/CCypri3n/PrivaTube?style=social)](https://github.com/CCypri3n/PrivaTube)

PrivaTube is a lightweight, privacy-focused alternative to YouTube. It uses the official Google API to fetch data but provides an ad-reduced experience with a simplified UI and only essential features. Run it locally on your machine (requires internet access) or open ccypri3n.github.io/PrivaTube.

## Features

*   **Ad-Reduced Experience:** Enjoy YouTube content with fewer distractions.
*   **Simple UI:** Focus on the videos without unnecessary clutter.
*   **Local Execution:** Run PrivaTube directly on your computer.
*   **Google API Powered:** Access up-to-date YouTube data via the official API.
*   **Trending, search and channels:** Browse trending videos per country (FR, DE, GB, ES, US), search videos and channels, and open channel pages with their uploads. Shorts are filtered out.
*   **Privacy-friendly player:** Videos play through `youtube-nocookie.com` embeds, with title, channel, views, likes and a linkified description (timestamps and YouTube links open inside PrivaTube).
*   **Comments:** Top or newest first, with "Load More".
*   **Sharing:** Copy a PrivaTube link to any video.

## Usage

1.  Clone this repository:  
    `git clone https://github.com/CCypri3n/PrivaTube.git`
2.  Open `index.html` in your web browser (or visit the hosted GitHub Pages version).
3.  Get a YouTube API key (see instructions below) and paste it into the prompt on first load. It is stored only in your browser's `localStorage` and sent only to Google.

## YouTube API Key

PrivaTube uses the official YouTube API!

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and log in.
2. Create a new project:  
   - Click the project dropdown (top left) → **New Project** → Name it → **Create**.
3. Enable the API:  
   - Go to **APIs & Services > Library**  
   - Search for `YouTube Data API v3` → **Enable**.
4. Create credentials:  
   - Go to **APIs & Services > Credentials**  
   - Click **Create Credentials** → **API key**  
   - Copy the API key shown.
5. *(Optional)* Restrict your key to YouTube Data API v3 for security.

[More help from Google](https://developers.google.com/youtube/v3/getting-started)

## Contributing

Contributions are welcome! Feel free to submit pull requests with improvements, bug fixes, or new features.

## TODO

*   Refresh button for recent comments?

## License

[LICENSE](LICENSE)
