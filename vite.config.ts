import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Three.js is intentionally isolated from game code so returning players
    // can reuse the large, stable renderer chunk when Wild Roads changes.
    // Model parsers already load on demand from their own chunks.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'three-core',
              test: /node_modules[\\/]three[\\/]build[\\/]three\.module\.js/,
              priority: 20,
            },
            {
              name: 'telemetry',
              test: /node_modules[\\/]@vercel[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
    // The remaining large chunk is the isolated Three.js renderer itself;
    // application chunks stay well below this reviewed vendor threshold.
    chunkSizeWarningLimit: 650,
  },
});
