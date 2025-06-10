# PrivaTube

[![GitHub Stars](https://img.shields.io/github/stars/CCypri3n/PrivaTube?style=social)](https://github.com/CCypri3n/PrivaTube)
[![GitHub Forks](https://img.shields.io/github/forks/CCypri3n/PrivaTube?style=social)](https://github.com/CCypri3n/PrivaTube)

PrivaTube is a lightweight, privacy-focused alternative to YouTube. It uses the official Google API to fetch data but provides an ad-reduced experience with a simplified UI and only essential features. Run it locally on your machine (requires internet access) or open ccypri3n.github.io/PrivaTube.

## Features

*   **Ad-Reduced Experience:** Enjoy YouTube content with fewer distractions.
*   **Simple UI:** Focus on the videos without unnecessary clutter.
*   **Local Execution:** Run PrivaTube directly on your computer.
*   **Google API Powered:** Access up-to-date YouTube data via the official API.

## Usage

1.  Clone this repository:  
    `git clone https://github.com/CCypri3n/PrivaTube.git`
2.  Open `index.html` in your web browser.
3.  Get a YouTube API key (see instructions below) and configure the app for full functionality.

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

*   Add option to sort comments
*   Refresh button for recent comments?

## License

[LICENSE](LICENSE)
