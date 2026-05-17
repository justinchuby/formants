# Formant Vowel Chart

Real-time vowel formant analyzer that visualizes your speech on an IPA vowel chart. Runs entirely in the browser — no server, no dependencies.

**[Try it live →](https://justinchuby.github.io/formants/)**

![Screenshot](https://img.shields.io/badge/status-beta-6ee7b7?style=flat-square)

## What it does

1. Records audio from your microphone using the Web Audio API
2. Extracts F1 and F2 formant frequencies in real-time using Linear Predictive Coding (LPC)
3. Plots your current vowel position on a standard IPA vowel chart
4. Shows the formant trajectory as a fading trace, so you can see how vowels shift over time

## How to use

Open `index.html` in a browser (or visit the GitHub Pages link above), click **Start**, and speak. The green dot tracks your vowel position in real-time. Say sustained vowels like "eeee", "aaaa", "oooo" to see the dot move across the chart.

Click **Clear Trace** to reset the trajectory path.

### Local development

No build step needed. Just serve the files:

```sh
# Python
python -m http.server 8000

# Node
npx serve .
```

Then open `http://localhost:8000`. A local server is required because the app uses ES modules.

## How it works

### Formant extraction pipeline

```
Mic input → Pre-emphasis → Hamming window → Autocorrelation → Levinson-Durbin → LPC coefficients → Root finding → Formant frequencies
```

1. **Pre-emphasis** — High-pass filter (`y[n] = x[n] - 0.97·x[n-1]`) to boost higher frequencies and flatten the spectral tilt of speech
2. **Windowing** — Hamming window applied to each ~23ms frame to reduce spectral leakage
3. **LPC analysis** — Autocorrelation method with Levinson-Durbin recursion computes a 12th-order all-pole model of the vocal tract transfer function
4. **Root finding** — Durand-Kerner iterative method finds roots of the LPC polynomial
5. **Formant selection** — Roots are converted to frequencies; those with positive frequency, magnitude < 1 (stable), and bandwidth < 400 Hz are kept as formant candidates

### Vowel chart

The chart plots F2 (horizontal, reversed) against F1 (vertical), matching the standard IPA vowel trapezoid layout. Reference positions are based on average adult male formant values from Peterson & Barney (1952).

### Trace visualization

The trajectory fades over ~8 seconds using alpha decay, showing recent vowel movement as a gradient trail. This is similar to a Praat formant track but mapped onto the 2D vowel space.

## Files

| File | Description |
|------|-------------|
| `index.html` | Main page |
| `style.css` | Dark theme styles |
| `app.js` | Audio capture, UI updates, chart rendering |
| `lpc.js` | LPC formant extraction algorithm |
| `vowels.js` | IPA vowel reference data (F1/F2 mappings) |

## Browser support

Requires a modern browser with Web Audio API and `getUserMedia` support (Chrome, Firefox, Edge, Safari 14.1+).

## License

MIT
