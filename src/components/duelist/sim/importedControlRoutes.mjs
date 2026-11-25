// Real traversable routes with landing turns and cover bypasses.
export const routesToTest = [
        {
          name: 'Level 1 Horizontal (Bravo <-> Charlie)',
          waypoints: [
            { x: -105, y: 0, z: 90 },
            { x: 0, y: 0, z: 90 },
            { x: 105, y: 0, z: 90 },
            { x: 0, y: 0, z: 90 },
            { x: -105, y: 0, z: 90 }
          ]
        },
        {
          name: 'Level 1 Spine & Under L2 Hub',
          waypoints: [
            { x: 0, y: 0, z: 90 },
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: -105 }
          ]
        },
        {
          name: 'Level 1 Diagonal Pathways (L & R)',
          waypoints: [
            { x: -105, y: 0, z: 90 },
            { x: -66, y: 0, z: 32 },
            { x: -57, y: 0, z: 18 },
            { x: -52.5, y: 0, z: 0 },
            { x: 0, y: 0, z: -105 },
            { x: 52.5, y: 0, z: 0 },
            { x: 57, y: 0, z: 18 },
            { x: 66, y: 0, z: 32 },
            { x: 105, y: 0, z: 90 }
          ]
        },
        {
          name: 'Bravo Staircase Ascent (Y=0 -> 4 -> 8)',
          waypoints: [
            { x: -104.5, y: 0, z: 85 },
            { x: -111.5, y: 4, z: 85 },
            { x: -113.5, y: 4, z: 85 },
            { x: -113.5, y: 4, z: 81 },
            { x: -111.5, y: 4, z: 81 },
            { x: -104.5, y: 8, z: 81 }
          ]
        },
        {
          name: 'Charlie Staircase Ascent (Y=0 -> 4 -> 8)',
          waypoints: [
            { x: 104.5, y: 0, z: 85 },
            { x: 111.5, y: 4, z: 85 },
            { x: 113.5, y: 4, z: 85 },
            { x: 113.5, y: 4, z: 81 },
            { x: 111.5, y: 4, z: 81 },
            { x: 104.5, y: 8, z: 81 }
          ]
        },
        {
          name: 'Bravo Staircase Descent (Y=8 -> 0)',
          waypoints: [
            { x: -104.5, y: 8, z: 81 },
            { x: -111.5, y: 4, z: 81 },
            { x: -113.5, y: 4, z: 81 },
            { x: -113.5, y: 4, z: 85 },
            { x: -111.5, y: 4, z: 85 },
            { x: -104.5, y: 0, z: 85 }
          ]
        },
        {
          name: 'Charlie Staircase Descent (Y=8 -> 0)',
          waypoints: [
            { x: 104.5, y: 8, z: 81 },
            { x: 111.5, y: 4, z: 81 },
            { x: 113.5, y: 4, z: 81 },
            { x: 113.5, y: 4, z: 85 },
            { x: 111.5, y: 4, z: 85 },
            { x: 104.5, y: 0, z: 85 }
          ]
        },
        {
          name: 'Elevated Bridges (Bravo <-> L2 <-> Charlie)',
          waypoints: [
            { x: -96.5, y: 8, z: 81 },
            { x: -30.0, y: 8, z: 10 },
            { x: 0, y: 8, z: 0 },
            { x: 30.0, y: 8, z: 10 },
            { x: 96.5, y: 8, z: 81 }
          ]
        },
        {
          name: 'Level 2 Hub -> North Bridge -> Alpha',
          waypoints: [
            { x: 0, y: 8, z: 0 },
            { x: 0, y: 8, z: -20 },
            { x: 0, y: 8, z: -85 },
            { x: 0, y: 8, z: -105 }
          ]
        },
        {
          name: 'Alpha Left Staircase (Up & Down)',
          waypoints: [
            { x: -7, y: 0, z: -105 },
            { x: -14, y: 4, z: -105 },
            { x: -24, y: 4, z: -105 },
            { x: -24, y: 4, z: -103 },
            { x: -24, y: 8, z: -96 },
            { x: -24, y: 8, z: -94 },
            { x: -18, y: 8, z: -94 },
            { x: 0, y: 8, z: -105 },
            { x: -18, y: 8, z: -94 },
            { x: -24, y: 8, z: -94 },
            { x: -24, y: 8, z: -96 },
            { x: -24, y: 4, z: -103 },
            { x: -24, y: 4, z: -105 },
            { x: -14, y: 4, z: -105 },
            { x: -7, y: 0, z: -105 }
          ]
        },
        {
          name: 'Alpha Right Staircase (Up & Down)',
          waypoints: [
            { x: 7, y: 0, z: -105 },
            { x: 14, y: 4, z: -105 },
            { x: 24, y: 4, z: -105 },
            { x: 24, y: 4, z: -103 },
            { x: 24, y: 8, z: -96 },
            { x: 24, y: 8, z: -94 },
            { x: 18, y: 8, z: -94 },
            { x: 0, y: 8, z: -105 },
            { x: 18, y: 8, z: -94 },
            { x: 24, y: 8, z: -94 },
            { x: 24, y: 8, z: -96 },
            { x: 24, y: 4, z: -103 },
            { x: 24, y: 4, z: -105 },
            { x: 14, y: 4, z: -105 },
            { x: 7, y: 0, z: -105 }
          ]
        },
        {
          name: 'Bravo Building Interior & Rooftop',
          waypoints: [
            { x: -110.0, y: 0, z: 93.0 },
            { x: -116.5, y: 0, z: 93.0 },
            { x: -110.0, y: 0, z: 93.0 },
            { x: -104.5, y: 0, z: 85.0 },
            { x: -111.5, y: 4, z: 85.0 },
            { x: -114.0, y: 4, z: 90.0 }
          ]
        },
        {
          name: 'Charlie Building Interior & Rooftop',
          waypoints: [
            { x: 110.0, y: 0, z: 93.0 },
            { x: 116.5, y: 0, z: 93.0 },
            { x: 110.0, y: 0, z: 93.0 },
            { x: 104.5, y: 0, z: 85.0 },
            { x: 111.5, y: 4, z: 85.0 },
            { x: 114.0, y: 4, z: 90.0 }
          ]
        }
      ];

