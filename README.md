# Autopsy of a Data Trail


## Setup

1. Install Node.js LTS:

   https://nodejs.org

2. Clone the repository:

   ```bash
   git clone https://github.com/luciarebolino/Autopsy-of-a-data-trail.git
   cd Autopsy-of-a-data-trail
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Create a `.env.local` file in the project root:

   ```bash
   NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token_here
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_key_here
   ```

   The Mapbox token is required for the map. The Google key is required for the Google Photorealistic 3D panel (ask Lucia)

5. Run the project:

   ```bash
   npm run dev
   ```

6. Open:

   ```text
   http://localhost:3000
   ```

## Project Files

- Add GeoJSON files in `public/data/geojson/`.
- Add or edit map layers in `config/layers.js`.
- Main map interface is in `components/MapboxLayerMap.js`.
- Global styling is in `app/globals.css`.

## Do Not Commit

These files/folders are local only and should not be pushed:

```text
.env.local
.next
node_modules
```
