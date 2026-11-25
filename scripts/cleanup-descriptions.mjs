#!/usr/bin/env node
/**
 * Part B: Clean up descriptions on all script-imported DSL spots.
 *
 * Rules:
 * 1. Remove em dashes, en dashes, hyphens as punctuation. Rewrite naturally.
 * 2. Rewrite to sound like a real person talking.
 * 3. Business hours: use real hours if caption mentions checking them, or use
 *    hours already embedded. If not found, leave unchanged.
 * 4. NEVER use: em dashes, en dashes, hyphens as punctuation, semicolons,
 *    tildes, hashtags, emojis, "perfect", "ideal", "boasts", "features",
 *    "offers", "nestled", "vibe"
 * 5. Max 3 sentences. Keep ONLY: parking, how to get there, business hours,
 *    lights, getting kicked out, ground quality, spotter needs, spot conditions.
 * 6. If none apply, leave description empty "".
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadEnvFile(filePath) {
  try {
    return Object.fromEntries(
      readFileSync(filePath, 'utf8')
        .split('\n')
        .filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
    )
  } catch { return {} }
}

const env = { ...loadEnvFile(path.resolve(__dirname, '../.env')), ...loadEnvFile(path.resolve(__dirname, '../.env.import.local')) }
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Forbidden words/patterns check
function hasForbidden(text) {
  const forbidden = ['perfect', 'ideal', 'boasts', 'features', 'offers', 'nestled', 'vibe']
  const low = text.toLowerCase()
  return forbidden.some(w => low.includes(w))
}

function hasEmdash(text) {
  return text.includes('—') || text.includes('–') || /(?<![a-z])-(?![a-z])/i.test(text) || text.includes(';')
}

// The cleaned descriptions, hand-written based on the rules.
// Only parking, getting there, business hours, lights, getting kicked out,
// ground quality, spotter needs, spot conditions. Max 3 sentences.
// No em dashes, en dashes, hyphen-as-punctuation, semicolons, tildes,
// perfect, ideal, boasts, features, offers, nestled, vibe.
const CLEANED = {
  // Spots with forbidden chars or content that needs rewriting

  // Thornton Wallride: describes obstacle + run-up = strip those, nothing left in allowed cats
  'be615fca-097c-4432-bca0-101b24307c8d': '',

  // Crusty Ledges in Littleton: describes obstacles only
  '71ba1b05-7c91-4dc7-af1b-7c37c2536ad8': '',

  // Santiagos Bank: parking lot can be full (parking + spotter)
  'd1528636-c8ee-4530-832e-6870bef201f6': 'Parking lot can be very full so Sundays and holidays are your best bet. Bring a spotter for board retrieval near the road.',

  // 39th Ave: parking + bust + ground = all allowed
  '637b229e-8d25-4cfc-a5b4-604016823fb9': 'Street parking is available throughout the 39th Ave neighborhood. This is a public greenway so there is zero bust. Concrete is brand new and smooth throughout the entire area.',

  // Thornton High School Rails: describes obstacle only
  'b9cebe92-882a-45f0-a28c-56a8d8f275f8': '',

  // The Neal Mims Rail: describes obstacle + rough rollup
  '4688dfd4-328b-445b-bc59-7ebe1712d14d': '',

  // Holm Elementary: describes obstacles only
  '6da12a94-8e97-4028-8889-51dd514cdb06': '',

  // Golden Rails: describes obstacle only
  '5eeebc9f-1226-4718-95e7-f8eb2a7fc148': '',

  // 101 Colfax Civic Spot: security (kicked out) + wax mention (obstacle) → keep bust only
  'f1b175cc-aa3d-4266-b240-23e4e5cf6834': 'Security is visible in the Civic Center area and you may get kicked out.',

  // BK Ledge: parking + spotter for alley
  '688b44dc-7b60-4974-827e-1fa5c9370ae2': 'Street parking is available throughout the area. The spot ends in an alley so a spotter is recommended for passing vehicles.',

  // Armbrust Gym Hubba Ledges: parking + ground
  '2b71bb75-4ff1-4154-a4f4-5a8e1f206293': 'There is a large parking lot behind the gym with easy access and plenty of spaces. The main lot has smooth asphalt with a slight downward slope on the hubba section.',

  // Hamilton Middle School Rail: describes obstacle + smooth rollup
  '6c5b5a80-98cb-414b-94b7-42b4e9281b6c': '',

  // Polaris Elementary Rails: describes obstacle
  '5fceb19c-1923-42cc-a526-336935f1c5c0': '',

  // Newton MS Stair Set: school hours + parking
  '1acb3c56-c875-4ef2-aad3-46cbea3b7eeb': 'School property so plan to go after school hours. Parking is available in the school lot.',

  // Madame CJ Walker Park Ledges: parking + bust + ground
  'd9507cac-99f2-43f0-9d79-390fc93a1567': 'Street parking is available on surrounding neighborhood streets. This is a public park with no security concerns. The concrete is smooth with ample run up and roll away throughout.',

  // Kennedy Golf Course Quarter Pipe: how to get there + parking
  'e3c1248c-7b9b-4abd-a70c-e02e986291bb': 'Park at the dog park, walk the closed road, and find the gap in the fence to get in.',

  // Douglas Elementary: describes obstacles only
  'df1aada5-7ee0-432f-b774-76cb6ce66f6b': '',

  // S Parker Rd Handrails: parking + roll away (ground/obstacle note = skip) + spotter
  '7398b66a-674a-4be0-b4d9-a0559f8be571': 'Street parking is available in the plaza. The roll away is on bricks near one section so watch out.',

  // Westerly Creek Ledges: describes obstacle + ground note about drainage
  '18063b67-0164-4c9f-b6b1-0453fdd23bd2': '',

  // Great Plains Park Ledge: parking + bust + ground
  'd8b9e7fd-2782-4ed6-92ae-153e6e6dcc91': 'Parking is available in the Great Plains Park lot. No hassle is expected from pavilion visitors and the concrete throughout is smooth.',

  // Broomfield Stair Rail: parking. Obstacle description stripped.
  'acd8d056-cd6c-4058-ac48-26df321e611e': 'Parking is available across the street.',

  // Sheridan Frontage Rails: "perfect" forbidden + describes obstacle
  'a31daab6-befd-4882-b978-de9c2a5dc689': '',

  // Westminster Out Rail: describes obstacle only
  'c5f0b67e-0a20-4cd3-8850-331fc70ee569': '',

  // Westminster Wooden Ledges: describes obstacle + apartments (kicked out)
  'ae19ed10-608c-49c4-82de-77c68a405e8f': 'There are apartments right there so be mindful of when you show up.',

  // Littleton Prep Charter School: parking + bust
  '42747537-725f-4bce-9166-1cc71d30d356': 'There is a full parking lot to roll into and weekends are your best bet.',

  // Colorado Blvd Bank and Fence: ground + parking
  '560caf52-bcb6-4ece-b990-a5b0e15bb1cd': 'It needs a sweep but there is street parking all around.',

  // Skyline Park: ground + bust
  'cb3c38e9-d6d1-4da5-98f2-3091ab0df956': 'The ground is rough but it is usually quiet outside of the occasional pedestrian.',

  // Cap Hill Alley Ledge (c28da173): ground + bust reference stripped (Snarf's = not a category)
  'c28da173-9358-433d-884b-93d4c7d971b6': 'The road in the alley is rough but the roll up is smooth.',

  // Taxi by Zeppelin: ground condition (bring broom = spot condition)
  'b42c5dbc-6f60-4e69-86e4-2e45123feae9': 'Bring a broom since sand drifts onto the concrete.',

  // Aurora Mississippi Rail: describes obstacle only
  '51e13dda-3240-42a8-bcb1-9dcd488f91a4': '',

  // DTC Colorado Flag Stairs: parking + bust
  'b6d831b9-c164-42fd-8d51-9c509157b64d': 'There is tons of parking and no bust even with a small crew.',

  // DTC Tech Way Ledge: shade + timing + bust
  'de65c706-ae71-4111-81f9-c96976c2ec38': 'The spot is in the shadow of DTC office towers and is best in the morning or afternoon to avoid the shadow killing your shots. It is empty on weekends.',

  // Inverness Double Set: describes obstacle with "perfect" + parking
  '46bebcfa-cc25-4102-9c29-4f53b552fa3d': 'The concrete is clean and already hit.',

  // West 38th Set: apartments + cops + skate blockers (bust info)
  'ee7ed364-d0f4-4426-b798-a12aba74d1b9': 'Residents have called the cops in the past so keep an eye out. There is a handrail but it has skate stoppers on it.',

  // Westminster High: bust + timing
  '6a648f5d-d7a0-416a-ac99-75a3785b0ad1': 'Best sessions are on weekends when school is out.',

  // Boulder Gap to Curb: location description only (no allowed cats)
  'e76613cf-9f05-4bb7-b353-d13893b22c68': '',

  // Church Banks and Wallrides: bust + timing
  'c339eb6f-c4bd-4d51-8698-da60fb9aa35f': 'There are no skate signs but it has historically been chill. Avoid church days and weekday mornings.',

  // Littleton Loading Dock Bank: parking + bust
  'cd658de6-0bae40fe-804c-27a66ad09f30': 'The approach from the parking lot is easy and employees have been cool about skating here.',

  // DSST College View: describes obstacle only
  '8e1d9645-f37c-453f-a2c4-1d203bf97dc4': '',

  // C Ledge and Brick Bank: bust + timing
  'd4080df8-17c4-461a-a0bc-a175ed5f7d89': 'It is chill on weekends and after school hours.',

  // LoDo Ledges: bust + foot traffic
  '98eb56df-3c11-4178-98fa-3c3183c1bdd5': 'There is zero bust but heavy foot traffic on game days.',

  // Madison Manual Pad Rail: bust
  '82290389-d904-4d98-850a-81ceaadd1daa': 'There is a small active business nearby so keep it casual.',

  // East High School Rails: describes obstacle + bust
  '5d4ce8a7-8292-437c-8929-82437b77e68c': 'It is chill when school is not in session.',

  // Big Send in Lone Tree: describes obstacle only
  'b1905115-d28a-4db6-8e4f-dcf4915eb11a': '',

  // Carla Madison Rec Center: describes obstacle only ("great warm up" = not allowed)
  '08255e57-84f4-4664-9caf-cb27dcd5526a': '',

  // Broadway Rec Center Rail: spotter + ground note (ground has markings = obstacle)
  '77a285fd-10cf-42b9-965a-5d12c91299ac': 'Bring a spotter for cars on the roll away.',

  // Cesar Chavez Park: describes obstacle + bust
  '21fbddca-058d-46c0-a8d4-212a9c026e60': 'It is buttery and wide open most of the time.',

  // Winona Ditch: bust + ground
  '40af28c7-c86e-4360-8bd8-3e542957210a': 'This is a public path with barely any foot traffic and it is wide open most of the time.',

  // Northglenn Gap to Grind: no skate sign + bust
  '9c4ca170-ba82-45be-95f6-c5d642d7eb9b': 'There is a no skate sign posted but the store is vacant so it is quieter than normal.',

  // Boulder Bank to Curb: parking
  '769f3add-dba4-4305-b023-c6758d5127b8': 'You can approach from the parking lot at the apartment complex.',

  // Prairie Dog Banks: parking
  '7086e2f4-da71-4cc3-9a49-63b72937724c': 'Park at the liquor store or on surrounding neighborhood streets.',

  // Poze Blvd Multi-Spot: bust + parking + ground
  '7bf77a9b-eca4-4f3f-8f46-a6a9721c7e2d': 'School campuses so weekends and off hours are best. There is a parking lot on campus.',

  // Greenwood Village DTC Curb and Rail: describes obstacle only
  'd46fe8e6-893d-4f01-b616-87742b0c4ad5': '',

  // Buttery Benches: bust + parking
  '3ecf2350-0c52-4f6d-975c-17f84fe6cd65': 'Best after 5pm with no issues reported during off hours. There is a school parking lot on the premises.',

  // Denver Green School: bust + parking
  'bc565697-6bd3-4f0a-8465-ac71ef374bac': 'School property so weekends and off hours are best. There is both a parking lot on campus and street parking available.',

  // Nine Mile Station Snake Run Banks: parking + path description (how to get there)
  'e730568d-b58a-4f8c-a6b1-8c02ff42d196': 'RTD Nine Mile Station has a parking garage on site.',

  // Fillmore Church Ledge: bust + parking
  '543aabe1-6714-4b2e-884a-7120c9540bbc': 'Sunday is actually a good time to skate since everyone is inside. Street parking is all around.',

  // City Park Church Hubbas: parking + bust + spotter
  '2a53fe18-bab8-4eb5-bacd-740351ae0087': 'Park on a side street next to the spot. Church property so avoid service times. The roll away goes into the street and a spotter is recommended.',

  // DSST Cole Middle School Stair Ledges: parking + bust
  'bfe902f5-95c8-4828-9718-66f3467f779b': 'Street parking is available on all surrounding streets. It is a school so weekend afternoons are best to avoid getting kicked out.',

  // Cheesman Park Pavilion: parking + bust + ground ("ideal" forbidden)
  '6b96c4f8-69dc-4301-aaf1-a3406be87035': 'Street parking is available throughout the surrounding residential neighborhood. This is a public park and historical landmark with no security concerns. The marble ground inside the pavilion is smooth.',

  // McGregor Manual Pad & Rails: parking + how to get there
  '03a6a0f0-d4a3-4418-8b00-b3a4575bc79b': 'Street parking is available on surrounding LoDo streets. The concrete sidewalk runs alongside a waterway trail providing easy approach from multiple directions.',

  // Federal Blvd Street Quarter: ground
  '54df0f27-4d2a-45c5-a2a5-8532d4eec8b2': 'There are a few cracks around but nothing that ruins it.',

  // 14th Ave Flat Bars: parking + bust
  'ec251d32-d5bc-4bff-a291-11e31bed815e': 'There is abundant street parking downtown. Best after 5pm or on weekends to avoid foot and vehicle traffic in the alley.',

  // Civic Center Park Manual Pads: parking + bust
  '2d69a269-ca76-46f5-8b28-cde92d0235e7': 'Free parking is available on surrounding streets. City security patrols intermittently and sessions usually last 15 to 20 minutes.',

  // Horizon Middle School Hubbas: parking + bust
  '20fddc1a-16c1-4510-a1a8-70ecb8fb76b8': 'The school lot is available on weekends. School property so weekends and after school hours are best.',

  // Vanguard Classical Stairs: parking + bust
  '738b87f2-c6bb-427e-8d6d-a174f2305d85': 'The school lot is available on weekends. School property so weekends and after school hours only.',

  // Lowry Building Ledge: parking
  '2a2c4d60-0c44-4c62-b3ac-f5fe4fcb255d': 'Parking is available in the adjacent lot.',

  // IKEA Spot Centennial: describes obstacle only
  '4189fa00-dd9b-487a-819a-d2c5510177bc': '',

  // Brady High School Ledges: parking + bust
  '0ba25cd1-ae8d-471e-9556-13543517888b': 'The school lot is available. Summer months are more lenient so just leave if asked.',

  // Wash Park Curbs: parking + bust
  '945f11ae-dbae-41bd-9058-500b47f88a3e': 'Street parking is available on Marion St Pkwy. This is a covered area with zero bust so you can skate any time of day.',

  // Arvada Ledge: parking + bust
  '7f97e4f3-da65-4bd9-b92e-4bf95d8ad721': 'Street parking is available. No issues reported and zero bust.',

  // Glendale Bank to Curb: parking + ground
  '412ad6ac-58b4-46ba-b1d5-9c6a3a87df39': 'Street parking is available on S Colorado Blvd. It is a low traffic side street between road and parking lot.',

  // New Hope Ministries Rails: parking + bust
  '19d1aa1b-cf99-4733-9488-782e8f770e0d': 'Street parking is available. Church property with no issues reported.',

  // Wavy Ledge Littleton: bust + timing
  '171c129a-e1af-40ee-b9a1-2e5178619eb5': 'Playground property so keep it to weekends or evenings.',

  // Coors Field Flat Rail: parking
  'e5031021-27fa-4b47-b4e9-d34c9473f57c': 'Street parking is available throughout the area near Coors Field.',

  // 16th St Mall Manual Pad Cluster: parking + bust
  '62b6b306-3a4d-4c49-bbb7-92ffb6242ebb': 'Parking is typical downtown Denver with street meters and paid garages nearby. Getting kicked out is routine so just leave when asked to avoid any real issues.',

  // Centennial Fun Sized Ledge: bust + ground
  '3f9d7dc2-2274-4371-9c9a-50df5d455698': 'No bust and the ground is smooth enough to get some good clips.',

  // Aurora Loading Dock Rail: parking + bust
  '5449ee6e-fdce-4684-bcdb-3cac3021037a': 'Park in the warehouse lot. Weekends and late afternoons have less activity.',

  // Holly Park Ditch Spot Thornton: parking + bust
  '5cc14054-b47d-4acf-a5f6-caab1f00fa74': 'Park in the adjacent neighborhood and walk to the spot. No bust concerns at this public park space.',

  // Eudora C Ledge: describes obstacle
  'ce93103b-4dff-47bb-b60e-09cdc12cc92c': '',

  // MLK Library Plaza Aurora: parking + bust
  '2b55072f-b079-44ad-af7f-9b61d80cccc1': 'Library parking lot is available. Public plaza with no issues reported.',

  // Sushi Den Pyramid Banks: parking + hours (restaurant dinner hours Mon-Thurs 5-9:30pm, Fri-Sat 4:30-10pm, Sun 5-9:30pm, lunch Mon-Fri 11:30am-2pm)
  '73c7bda8-a220-47f0-9c76-514991b4e449': 'Street parking is available on the surrounding neighborhood streets. Sushi Den is open for lunch Monday through Friday 11:30am to 2pm and dinner Sunday through Thursday 5pm to 9:30pm and Friday through Saturday 4:30pm to 10pm, so skate outside of those times.',

  // West Arvada Loading Dock Banks: parking + bust
  'f0cc3afe-6227-450d-ba61-bebb42009ed5': 'Park in the warehouse lot. No issues reported.',

  // Arvada Marketplace Ledges & Rail: parking + ground
  'e48aa886-ce79-495c-ae15-128c7ef6b854': 'Parking is available throughout the large Arvada Marketplace shopping center lot. The ground is smooth concrete with minimal cracks and some plaster fills near the ledge areas.',

  // Huron and Exposition Spots: describes obstacles only
  'ed53db32-6bb0-4442-91de-61fe0ccadb89': '',

  // Central Park Benches: parking + bust
  'f116378c-32a9-4249-8cdd-8067a1104981': 'Street parking is available on MLK Jr Blvd. Public park area with very low bust.',

  // Alameda & Ironton Bank to Curb: parking
  'e7d3ab4a-dcd4-4fdf-aa78-f687fc825a3a': 'Parking lot access is available on site.',

  // McAuliffe International School Ledge Hub: parking + bust
  '6e9f4da6-f420-420a-a269-daa186e344ee': 'Street parking is available on Holly St and surrounding residential streets. It is a school so weekend afternoons are best to avoid getting kicked out.',

  // Denver Museum Big Rail: bust + foot traffic
  'c0ec3de8-acf6-45a1-911f-35620190037b': 'It gets busy on weekends.',

  // Chambers Rd Bank to Brick: parking + bust
  'f4a50917-e433-4cbe-9584-5dd6ebbc57a5': 'Park in adjacent lots. Employees have been supportive.',

  // Commerce City Curved Planter Ledges: parking
  '8fb16cf2-dd1c-4982-a999-1d2f2b78aab0': 'Parking is available in the commercial lot on site.',

  // 84th Ave Ditch: how to get there
  'c516b546-e80e-4bd8-a07a-9e2cbcf88986': 'Park at Sportsman\'s in the back and walk down the dirt trail to get here.',

  // Littleton Sundial Manual Pad: describes obstacle
  'c936b444-ad6c-4457-8e3e-aab4fbf42ffa': '',

  // Rangeview High School Stairs: parking + bust
  'bf28979c-07d1-4fb9-9cf4-0b4111585fe9': 'The school lot is available on weekends. School property so weekends and after school hours only.',

  // Joe Shoemaker Elementary Stair Sets: parking + bust
  '0b1827a6-1af3-47f2-b7d9-8da7c2443fc7': 'Street parking is available on Havana St and surrounding streets. It is a school so weekend afternoons are best to avoid getting kicked out.',

  // Sheridan Union Ave Ditch: bust + ground
  '5c8f5e63-d55c-4b70-b43c-c98a268d448e': 'No bust at all, just show up and roll. The concrete is good.',

  // CU Boulder Banks: parking + bust
  'bd224253-3b68-430e-8d3e-4b15e670f1a6': 'Park on 30th street. Security patrols sometimes but I\'ve personally never gotten kicked out.',

  // Nine Mile King Soopers Ledges: parking
  '2775d41a-66a0-45dd-ae5e-7d9b18b1979a': 'Parking is available in the King Soopers lot on site.',

  // Northglenn High School: bust + timing
  '0cd34de2-44c1-4679-9149-4f5a1e90a942': 'Hit it on weekends when school is out and it is all yours.',

  // Boulder S-Rail: parking
  'b2ccfa53-465b-4220-9a0f-6a20a7a86e41': 'Street parking is available on surrounding blocks.',

  // Lowry Boulevard Planter Ledges: parking
  '713de15c-293d-41f5-b86e-d06754fb6c20': 'Parking is available along E Lowry Blvd and in the adjacent commercial lots.',

  // Northglenn Gap to Rail: describes combo of obstacle + area
  'e67dd701-3235-494d-87df-9ac2842f0af5': '',

  // Clyfford Still Museum Rail: parking + bust
  '46fbcab1-6753-4903-b985-61b98753b964': 'Park on Bannock St or adjacent side streets. Museum property so after hours or weekends are best since foot traffic is busy during the day.',

  // Quebec Street Lowry Ledge and Stairs: parking
  'baa87d31-8e80-47bb-9ac5-0749f2dbd488': 'Parking is available in the commercial lot on site.',

  // Joyeria 3 Grinder: hours (10am-6pm = already in desc)
  '69cfecb7-e564-4b04-ad84-aada381d8e0b': 'Skate outside of business hours which are 10am to 6pm.',

  // Westminster Bank to Bank: describes obstacle + bust
  'ebef2a78-c3d9-49a0-bce0-12596ec9f920': 'No bust at all.',

  // 95 S Tejon Curb: parking + bust (em dash present)
  'ddd7f9c9-e318-4c0d-b919-62040a2ac45f': 'Street parking is available at the park across the street. Business is operating during weekdays so weekends or after hours have less hassle.',

  // Will Call Venue Stair Set: parking
  'b93e0951-cf72-496d-8d62-174e2bf5983b': 'Street parking is available on Brighton Blvd and surrounding industrial streets.',

  // Denver Green School Hand Rail: parking + bust
  '68de3cfa-6a8a-4271-be4a-75091bd34c0b': 'Street parking is near the school. School property so skate on weekends or after school hours.',

  // East 58th Auto Shop Loading Dock: parking
  '5f3163e4-2d64-4a0b-8b5f-28a4770d6fa9': 'Street parking is available on E 58th Ave.',

  // South Broadway Wall Ride Plaza: describes obstacle + parking + bust
  '7c07a330-19b0-4ae7-9bbb-2cdb4d47acf8': 'There is decent room to set up with plenty of run up and street parking available.',

  // Knox Ct Green Ledge: parking
  '8cf11444-d754-42fb-86d9-85a6113e3542': 'Street parking is available on Knox Ct.',

  // Arapahoe Road Strip Mall Stair Set: parking
  '2aa87755-fc7e-40a0-9b03-94dd1b09f8b6': 'Parking is available in the strip mall lot on site.',

  // Congress Park Alley Bank: describes obstacle
  'a349cb10-bed8-4326-8a3f-cf35db152422': '',

  // St. Elizabeth's School Stairs PT.2: parking + bust
  'f5acd175-3861-4d96-be15-55993ed5e518': 'Street parking surrounds the school campus. School property so skate on weekends or after school hours.',

  // Highlands Heritage Regional Park Ledges: parking
  '019195d6-15f2-4866-8e78-c726f653c8a5': 'Parking is available at the Highlands Heritage Regional Park lot on site.',

  // Littleton Blvd Bank to Curb: describes obstacle
  '253e856e-01b6-41fd-b5e6-6234d2681b12': '',

  // Sherman St Rail & Ledges: parking + bust + ground
  'c160d973-b15d-4fe9-960a-e512c5ee9a65': 'Street parking is available throughout the area. Near a school lot so someone may ask you to leave. The ground on approach is smooth.',

  // Exposition Avenue Concrete Bump: parking
  'bc0f2fd6-2a78-4b0b-87be-d812f8ad3b27': 'Parking is available along E Exposition Ave.',

  // Rio Grande Bump to Flat: describes obstacle
  '8f17752d-ac62-446e-a9f9-d8530f25783e': '',

  // 46th Ave Bank to Ledge: parking + ground
  '30c4dfa8-fa4c-47df-936d-a06318b971f0': 'Street parking is available near E 46th Ave. The concrete throughout is smooth.',

  // Hoffman Library Skate Plaza: parking + bust
  '08563ecf-8a88-437e-9b8f-4fc62d8d5396': 'Parking is plentiful in the Hoffman Library lot on site and there are no issues getting asked to leave.',

  // Washington St Ditch Spot: describes obstacle
  '2792dcbe-97b3-4f0c-ad13-447f2786eb34': '',

  // 700 Broadway Hubba Plaza: parking + ground
  '28937f18-1d0d-4002-ba18-a190f7be0625': 'There is plenty of parking around the downtown plaza. The concrete is smooth throughout with plaster patches on some approaches.',

  // Havana Church Double Kink Rails: parking + bust
  '2f60cd23-f1e1-4763-9f12-81ba3b8e1daf': 'Street parking is available on Havana St. Church property so session timing is unpredictable and you should go on days with no services.',

  // Jewell Ave Ledges: describes obstacle
  'b6aa7e95-8dc0-40a6-83db-496c672f0858': '',

  // Art Hotel Yellow Bench: parking + bust
  '44d7d78b-ce87-44ff-825c-62bccce1d49f': 'Street parking is available on Broadway. Expect a quick bust from hotel security.',

  // Hampden Chase Bank Planter Ledges: parking
  'aa95b84f-6ea7-493c-9c9e-0bc0f52c4c74': 'Parking is available in the Chase Bank lot on site.',

  // Mulberry and Vallejo Ledge: describes obstacle
  '65696d98-a814-4430-9a46-c9d3fba162e6': '',

  // History Colorado Center Ledges: parking + bust + ground
  'ca3402fa-29d0-4bb3-b6d3-52b4d6903dd6': 'Street parking is available on Broadway or in nearby lots. Expect occasional security and you may get kicked out. The concrete on all surfaces is smooth.',

  // Hampden Restaurant Gaps: parking + bust
  '626761eb-93b2-441e-9143-14011856d529': 'Parking is available in the surrounding lot. Only go after business hours to avoid getting kicked out.',

  // Cherry Creek Up Ledge: spotter (board rolls into street)
  '09d19ff9-150a-4135-834f-3db59d2cb617': 'A spotter is needed to catch your board from rolling into the street.',

  // Belleview Ave Heavy Stairs: parking + ground + spotter
  '8b39a295-0171-4f16-b507-d30e29ce8f30': 'Parking is available in the adjacent parking garage. The ground is rough but the concrete is smooth on the approach. Use a spotter on the roll away.',

  // Aurora School Bench Ledges: parking + bust
  '074ef86a-24d6-4cb0-ba16-7906c25355fc': 'Street parking is available on E 25th Ave. It is a school so weekend afternoons are best to avoid getting kicked out.',

  // Westminster Station Ledge: bust
  '7339c726-d3f2-45fa-9477-fcded151d6aa': 'No bust since it is a transit station.',

  // Newport St Parking Ledges: parking + bust
  '90888c8d-e1b2-4e6b-8347-1e7c23fad5db': 'There is plenty of street parking and it is near an RTD station. Businesses nearby may ask you to leave so weekend afternoons are less busy.',

  // City Park Blue Ledge and Wallride: parking + bust
  '53ca25d3-054e-4a6f-b27a-c05f8e70bf77': 'Street parking is available on E 18th Ave. The brick wallride across the street has a private property sign but the blue ledge on the main side has had no issues.',

  // Pecos St Bank Spots: describes obstacles
  '42e46675-5506-4d46-9b3f-3b05eeffcab1': '',

  // Englewood S Broadway Ledge: parking
  '4efe9d53-6b58-41f9-9d73-24284c5ab4ea': 'Street parking is available on S Broadway.',

  // Northglenn Commercial Stair Sets: parking
  '4cab43f4-5b37-40cd-99f8-92b02935a4aa': 'Parking is available in the commercial lot on site.',

  // Westminster Bank to Rail: bust + timing
  '4447a498-ec0d-4bab-a735-9915804d0097': 'School property so keep it on weekends.',

  // Lakewood Bank to Ledge: parking
  'e970e174-8177-476f-a99a-3565bb395ad2': 'Street parking is available on adjacent streets.',

  // Inland Island Loading Dock Ledge: parking
  '3508fcd9-9df7-4a02-ac1f-49353b6d9498': 'Street parking is available on E 58th Ave.',

  // Viking Bar Roof Drop: describes obstacle + spot condition
  '01c2d9fa-8196-47f1-ac34-b165fb776540': '',

  // Alameda Ave Slap Ledge: parking + bust
  'bcb18061-da5b-4982-924e-71ede5bb484c': 'Adjacent commercial parking lot is available. No bust reported.',

  // Bellewood Underpass Bank: parking
  '86551dfb-eb9f-4644-9df3-88ff6bfd8a48': 'Street parking is available on Bellewood Pl.',

  // Crown Pointe Academy Rails: describes obstacles
  '743eaf00-893b-41a9-a23f-f2ae74a42be5': '',

  // Yale Ave Ditch Banks: parking
  '33530bac-be39-44f8-800d-6ae254bea723': 'Street parking is near the S Jasper St and E Yale Ave intersection.',

  // Baker Warehouse Stair Hubba: parking + bust (unfriendly owners)
  '760759c5-e7ed-4323-ab15-2ff906799d82': 'Street parking is available in the surrounding warehouse district. Private property with no skateboarding signs posted and owners have not been friendly to skaters.',

  // Highlands Ledge: foot traffic + apartment
  '893ca307-ebe2-428a-bbb8-91f2e05f97ba': 'Watch out for heavy foot traffic. It is in front of an apartment complex.',

  // Aurora Two Stair Ledge: ground + bust
  '81a9672a-d1f2-4a74-a3b3-c2f9500cf28b': 'The concrete is super smooth and there are no signs of getting kicked.',

  // Centennial Center Park Stairs: parking + bust
  '22ed908c-0772-4f60-90fa-8e17f6b72d63': 'There is a parking lot on site at Centennial Center Park. Public park setting with low bust risk.',

  // Jewell Collision Ramp Rail: parking + bust
  '296aa64d-9140-4832-a634-bc4e98bd2d68': 'Parking is available in the adjacent lot. Business is on site so best to skate early mornings or weekends to avoid issues.',

  // Overland High School Spots: describes obstacles
  '8445af04-eefa-454a-958c-c3a8bb8f4890': '',

  // Sloans Lake Pump Track: parking + bust + ground
  'c20a29a9-2d3a-46e7-ac5e-9719183dd5db': 'There is plenty of parking in Sloan\'s Lake Park lots. No bust but kids frequently use the track. The concrete is smooth throughout.',

  // Green Mountain ACE Embankment Bank: parking
  '2f6b03a2-98bc-400c-92b1-6f126ae7b016': 'Parking is available in the ACE Hardware lot on site.',

  // Westminster C Rail: describes obstacle + bust
  '25929103-badd-47b6-8a18-0fcf4981b471': 'No bust with virtually no foot traffic at this random intersection spot.',

  // Ken Caryl Hubba: parking + bust
  'b8e81da4-c30e-4128-bf95-05cceda86cbe': 'Street parking is available in surrounding lots. Security is known to enforce no skating here.',

  // Montbello Banks: parking
  '69a39456-5873-4143-9b3b-f1bb4f0d3e83': 'Parking is available in the warehouse complex lot on site.',

  // Westminster 88th Ave Rails: describes obstacles
  '9b8334e6-cd46-46b8-8552-326331db3b8c': '',

  // E 1st & Bellaire Park Ledge: parking + bust
  '0a998681-59ba-4396-9877-8a247593b1fa': 'Street parking is available all around the park. Zero bust with low foot traffic in a public park setting.',

  // Ogden St Alley Bank to Ledge: parking + bust (15-20 min hyphen = ok as range)
  '3b72cd73-3577-498c-ac0e-2304e5ef747b': 'Street parking is available on Ogden St. Close to apartments so skate at respectful hours. Zero bust when visited but just be cool if asked to leave.',

  // S Federal Blvd Bank: parking + ground + describes obstacle
  '31b65d58-af93-45f5-b01f-1a5c48ad0dbd': 'Street parking is available along S Federal Blvd. The sidewalk run up is smooth.',

  // Dartmouth Ave Barriers: parking + ground
  'be26c87c-a53d-4042-977d-f21d990f264a': 'Street parking is nearby and you can also push from Cushing Skatepark across the street. The spot is crusty with weeds.',

  // Park Hill Parking Lot Curb: parking + bust
  '25d338b9-b95c-4621-91da-babf8c20f5ba': 'Large parking lot with plenty of spots. Best to skate when the business is closed since you will likely be asked to leave if you stay too long around the cars.',

  // Westmoor Center: describes obstacles + timing
  'a6460e8f-54d8-48f1-8fdf-20b896ca4831': 'Empty on evenings and weekends.',

  // Denver Coliseum Spots: parking + bust + ground
  '5e7a8bbe-6662-4c01-8581-45d4e19d1e99': 'Street parking is available throughout the area. Went on a weekday afternoon with no issues but got some looks. Ground varies by area with varying obstacle sizes scattered around the complex.',

  // Globeville Landing Park Ledges: bust + describes obstacles
  'd0760ee2-cf68-4cbb-bba3-e0ab485dd58b': 'Public park along the Platte River with easy access and no bust factor.',

  // CSU Spur Campus Spots: parking + bust
  '48373207-9189-4bd0-b52a-d597e80e0691': 'Street parking is off campus with easy access. Security is very active and not chill so skate at your own risk and time of day carefully.',

  // La Alma Lincoln Park Bump to Rail: parking + spotter + ground
  '12c49ede-da6e-428a-bd50-92aeaef4c1fd': 'Street parking is available throughout Lincoln Park. Bring a spotter to gap out to the road on the roll away. The run up has smooth concrete with cracks sealed along the approach.',

  // Veteran's Park Banks: parking + bust + describes obstacles
  '92ff7659-1e87-442a-bb18-35c041c964d4': 'Street parking is available nearby. The spot is behind the police station so be on your best behavior.',

  // Westminster W 112th Manual Pad: describes obstacle + ground ("skatepark-quality")
  'a706862d-5144-4309-a65a-6e85fe99c315': '',

  // Lowell Blvd Kinky Rail: parking + bust
  '7959a603-42e4-4b61-ba33-e4243e4902bd': 'Street parking is available throughout the neighborhood. School property so skate on weekends or after school hours.',

  // 17th & Curtis Downtown Ledge: parking + bust + spotter
  '8773ec31-efd7-46e4-89a7-edb3ba72ac65': 'Paid parking is nearby with plenty of options in downtown Denver. No bust but best when traffic is lighter or bring a spotter.',

  // Speer & Larimer Campus Spots PT.2: parking + bust + ground
  'de01e377-5570-4e05-a3aa-8e64c9d46d6f': 'Parking is available all over downtown but you may need to push to the spot. The area does not feel welcoming to skaters but no one asked to leave. The ground is smoother than PT.1.',

  // Mississippi Ave Playground Spot: parking + bust + ground
  'e10ec621-3b05-473e-a051-66a9d2421b5c': 'Parking is out front with easy access. Went on a weekend afternoon with no issues from anyone.',

  // Expo Park Rails: bust + ground
  'fbb26627-ee7f-4adf-b983-9ba4762aad5a': 'The facility does not welcome skating with stoppers on curbs throughout. Went on a mellow afternoon with no issues so go at a quiet time. There is dirt at the base of the stairs but it can be swept.',

  // Westminster Big Rail: describes obstacle + ground
  '8b7f021f-7238-4e88-b69b-009d449c2fda': '',

  // Federal & Severn Bus Lot Hubba: parking + ground
  '60790cac-71da-410d-95c0-f9ea6d13bf44': 'Street parking is available all around. The concrete is smooth with almost no cracks.',

  // Tejon St Metal Ledges: parking + bust + ground
  'b75cbc79-2ee6-4d07-bbef-89f7a824867d': 'Street parking is available all around. Business property so skate on weekends or after hours. The concrete is smooth once past the sidewalk with a street roll up for speed.',

  // Holly St Manual Pad Hill Bomb: parking + bust + spotter
  '42098881-90a6-408d-822a-5a253b865a23': 'Park in nearby lots. Zero bust and no one will ask you to leave way out there. A spotter is required since it is a busy road with traffic and the hill builds serious speed after the platform.',

  // Prairie Middle School: bust + describes obstacles
  'e27a0846-e2bf-4f3d-aead-62e98f97d874': 'Hit it outside school hours.',

  // Valley Business Center Spots: parking + bust + spotter
  'd3b6960b-c38d-4350-aa65-91a7b53509ec': 'Street parking is right near the rail so you can park and push around the whole complex. No one asked to leave during the visit. A spotter is recommended at the rail due to street traffic.',

  // Discovery Park Double Ledge: bust + foot traffic
  '02f403eb-319c-4b2b-93ee-fa803d4ebbba': 'The park is very active so there may be kids running around or families sitting on the ledges.',

  // Littleton Bank to Curb: wax mention = obstacle
  '457ff0f4-88f8-43b2-9e38-2ba7b94fb6be': '',

  // Denver Downhill Driveway: describes obstacle only
  '29a551f9-802a-42c5-8a6b-db933e440e5c': '',

  // Lasley Park Ledges: parking + bust
  '8c80c8f3-cbd5-424f-8576-d1e295625f51': 'Public park with easy parking and it is right next to Link Skatepark for a full session. No bust with multiple waxed obstacles throughout the court area.',

  // Rino 2 Block: describes obstacle
  '1a6dca28-e122-42d1-a9ee-2f1a5904383e': '',

  // Cap Hill Ledges: bust + hours (storage unit closed Sundays)
  'c7c0a06c-4f9f-48c7-8f9f-aea72d77fe4b': 'No bust has been reported but there could be a chance of getting kicked during business hours. The storage unit there is closed on Sundays.',

  // Sunshine Peak Academy School Yard: describes obstacles
  '4f17c829-a6eb-4adc-a36a-e32800b65b5c': '',

  // Edgewater Metal Ledges: describes obstacles
  'e5154cc1-4de5-40c0-9fa0-e7d204352078': '',

  // Lasley Elementary Back Rail: parking + bust + ground
  'd73e77e0-b64a-4f1f-a5d1-2c4f3166a2a5': 'Park in the lot or push over from Link Skatepark nearby. School property so skate after hours or on weekends. There is grass on both sides of the rail with plenty of run and roll away space.',

  // Area 51 Lakewood School Ledges: parking + bust + ground
  '028796e9-d558-4d8c-aab3-5a31d44de48d': 'Park in the lot or at Link Skatepark directly across the grass. School property but described as never a bust so choose your time appropriately. The ground is smooth and crack free throughout.',

  // Aurora Gap to Hubba: parking
  '8461f230-cbb3-466d-9ebc-1d07334f3fb4': 'Parking is available in the industrial complex lot on site.',

  // Meow Wolf Highway Bank: parking
  '4b2e08ae-4260-471b-9c6b-8e8ae7bc80e5': 'Parking at Meow Wolf.',

  // Lowry Sports Corner Ledge: bust (can't skate during baseball games)
  '7250f5e2-1a24-4fce-879b-11ed4b2616c9': 'You cannot skate during baseball games.',

  // MLK Early College Rails: bust + timing ("perfect" forbidden)
  '133e3df8-78d4-4333-b185-b1c8128a4afa': 'The concrete is clean and there is plenty of room. School hours apply on weekends.',

  // Park Meadows Bike Path Bank: parking + bust + ground
  'f4e38e84-7362-482e-a9f3-e2290b7988e9': 'Park next to the At Home store with the spot right off the adjacent bike path. Zero bust with no stoppers and no one around. The ground is brand new smooth concrete.',

  // Avail Sidewalk Ledges: describes obstacle
  '295bf0d4-30cd-4b68-9938-9fb9986da97e': '',

  // Wadsworth Bank to Ledge: spotter
  '484018bc-363a-4ddd-9c0d-3d8c1cde2b5d': 'Watch out for your board shooting out into traffic next to the busy road.',

  // Alley Ledge: ground (bring broom)
  'd4753b4b-aee8-4874-b546-8597353a28d6': 'Bring a broom.',

  // Meadow Point Elementary Rail: bust + ground
  '17cce088-9552-4513-be8f-f41381b829c1': 'School property so go on weekends. There is grass on both sides of the rail with plenty of run and roll away space.',

  // Federal Blvd Car Lot Ledge: parking
  '499c4ed3-f2e2-4363-bce9-95fc12495675': 'Street parking is available along Federal Blvd.',

  // Wheat Ridge WR Ledge & Hip: describes obstacle
  'f5883755-d06f-42df-8d06-aec63625b23e': '',

  // Ace Hard Bank: how to get there
  'f0f5f91f-f58e-4639-90cc-70790fb1a602': 'It is behind the Ace Hardware.',

  // Aurora Plaza Long Rail: hours (businesses close by 8pm)
  '9aef4dc4-6610-483a-a202-4d84c5d3ea47': 'Most of the businesses in the plaza close by 8pm so plan accordingly.',

  // Aspen Crossing Elementary: bust + describes obstacles
  '24ed08c3-83b2-401a-84f2-0ea078d7a857': 'Weekends only.',

  // Wadsworth Liquor Store Bank: parking + ground + bust
  'd90fe7f2-5e97-4a31-9aae-c7ae68388bfb': 'Street parking is available near the Wadsworth liquor store complex. The concrete bank transition is clean and smooth. Not a reported bust spot.',

  // Confluence Park Ledges: parking + bust + ground
  '75b675ef-256f-434f-8379-7fe77d4765bb': 'Plenty of street parking is nearby at this busy public park. No reported bust. The ground varies by area with some brick and some smooth concrete.',

  // Sky Vista School: bust + describes obstacles
  '711e332e-c63e-4e4a-8e58-b3d913c74e1f': 'Weekends only.',

  // Promise Fence Gap: describes obstacle
  'bf3d01ff-cb33-4bde-bc06-0fee380d34b7': '',

  // Summit Elementary Circle Rails: bust + describes obstacles
  '82476cdd-d34b-4934-bc4b-706632f0d8fb': 'Weekends only.',

  // Aurora Hampden Hamilton Plaza: describes obstacles
  '36809bb8-77f4-4fe7-9ecf-69b67bb86d50': '',

  // Post Office Mini Rails: bust + ground
  '6940200f-13dc-4935-bf20-421dca9753df': 'This spot is usually blocked by trucks but you can skate when they are not around. The concrete is extremely smooth and you have not been kicked out yet.',

  // Broadway Station Rails: describes obstacles
  '06d20edb-e485-40cc-83dc-e902710ea1ac': '',

  // Grant St Parking Lot Rail: parking + ground
  '395ec646-b1e6-46aa-a396-c357dc1cf7aa': 'The parking lot at the complex is available. The ground is smooth asphalt.',

  // Founders Park Ledges: "perfect" forbidden + describes obstacle + nearby spot
  'a18bfd07-2424-4c7d-bc5e-2fbbe276c1a5': '',

  // Park Ave Bank to Ledge: bust
  '7a8fd0bb-2e59-44c8-a74b-98662ecfc558': 'Near the Denver Police Department Training Facility but the cops usually just drive past. Getting kicked out is always a possibility.',

  // Colorado School of Mines: bust
  '325ee8fa-53f1-4860-9ae9-c456d0f8df2e': 'Bust is dependent on time of day and semester but people have been skating here for years with no tickets, though you can expect some running and warnings.',

  // Termo Rails: describes obstacles
  '9ef4ae70-8fbe-47f5-9fd3-4b8003f2f4d6': '',

  // Evans Barrier: how to get there
  '319cdec2-ecec-4941-b700-9c0f4d271daa': 'Park at the Evans RTD station and walk towards the bridge that goes over the interstate. If you go under the bridge you should see the spot when facing the direction of the Ford dealership.',

  // Morey Middle School Bench Ledges: parking + bust
  '6d1f6bcf-a773-43a3-b6e6-c1eec4deacca': 'Street parking is available on E 14th Ave. School property so weekends only to avoid issues.',

  // Sidewalk Gap & Mini Ditch: location description
  'a96cf25a-9674-4813-b54a-7c4e2d79a7be': '',

  // Metzler Blocks: bust + timing (blockers on hubbas = obstacle)
  '57de9119-7f09-43cf-a93a-74d7e1093419': 'At a baseball field so plan to skate it around game days.',

  // State Farm Manny Pad to Bank: hours already in desc (M-F 9am-5pm, weekends closed)
  'b7dfcba2-0ce5-4c9f-8f2b-d7cf2566b75f': 'Business hours are Monday through Friday 9am to 5pm. It is closed on weekends so that is the best time to skate.',

  // Arvada Post Office Rail: closed Sundays = best on Sundays
  'cabdf831-79e6-4c3a-a033-9dabf0301c3c': 'Closed on Sundays so Sundays are your best bet.',

  // Panorama Park Ledges: foot traffic
  'b69773c9-351e-440d-ab07-db9cb59a615a': 'It can have a lot of people sitting around on busy days.',

  // Loading Dock Hand Rail: hours (closes 4pm weekdays, closed weekends)
  '82aa8182-59fe-4b3a-b1f4-8f0f047b84c8': 'The business closes at 4pm on weekdays and is closed on weekends, so weekends are your best time to skate.',

  // Greenwood Village Circle Rail: parking + ground
  'e0c89493-39a9-4d0d-b98e-5fd6917c0c65': 'Tons of parking is available in the lot and the concrete all around is smooth.',

  // Cranmer Park Sundial Banks: parking + bust + ground
  '6a86fa54-0b3d-4179-9a55-6b69379a9605': 'The parking lot with plenty of spaces is directly adjacent at Cranmer Park. Zero bust with occasional pedestrians. The ground is rough on the sundial but smoother near the stairs and rail.',

  // Poudre 2 Grinder: hours (7:30am-7pm every day)
  '56613dc6-5d0e-420c-906b-039e736d4908': 'After hours only. The business runs from 7:30am to 7pm every day.',

  // Muslim Community Center Rail: hours (5am-10pm 7 days)
  'cd72bf42-89da-47f0-b763-586a75f4c364': 'Go after business hours. They are open 7 days a week from 5am to 10pm.',

  // Cherry Creek Double Rail: bust
  'cd02cd1b-13c3-4fae-a444-53b6720cefea': 'You may get kicked out during business hours.',

  // Lowes Mercado Loading Dock Bank: parking
  'ed8060fa-97f5-45a0-8e12-1691835fecbe': 'Parking is available in the Lowes Mercado shopping center lot on site.',

  // Lollipop Lake Rainbow Ledge: bust
  '562a6920-d5be-4283-b6ae-9d01d6b52128': 'Zero bust in the public park.',

  // McGlone Academy Ledges: describes obstacle (partially blocked)
  '68a15bd9-1bf7-4334-9b4c-6f757f63ad96': '',

  // Montbello Ditch: location/intersection description
  '5bf59b41-c700-4383-99a6-c423920bef5e': '',

  // Munroe Elementary Rocks and Rail: describes obstacles + ground
  'c75cb373-94e2-429b-bdbe-35970e7bef2b': 'The ground throughout is smooth.',

  // Lima St Bank to Wallride: bust + spotter
  'fd41a312-5d07-49f6-bd47-2ac4308d01bc': 'No bust on Sundays. It can get sketchy so bringing a friend is a good idea.',

  // Decatur St Ledges: spotter + bust (apartment)
  'dbf66d5e-f4c2-4adf-8d3e-ba3f4f209e32': 'Bring a spotter for the landing. It is at an apartment building so do not go too late or too early.',

  // Eliot St Bank to Curb: hours (M-F 8am-6:30pm)
  '424f6f9c-36cb-42fc-907c-9e29b0fba6bb': 'Business hours are Monday through Friday 8am to 6:30pm, so skate outside of those times.',

  // Mile High Wallride: describes obstacle (crust if you must = useless)
  '66a561d5-a6c3-4b40-b803-9ce368e5629c': '',

  // Westminster Rail & Ledges: location note (McFall Park name)
  'f4cf43ae-e903-48b1-9fcc-6b49414a2b7c': '',

  // Ruby Hill Federal Ledge: describes obstacle only
  '066a1619-54e7-408f-87e8-99d108686d46': '',

  // Central-70 Cover Park Ledges: parking + bust + ground
  'd7ccaeb4-3c9a-4889-9660-8bd8ac5b729e': 'Street parking and nearby lots are available in the Central 70 corridor. It is a public splash park for kids so be respectful. The brick ground is slightly bumpy but skateable.',

  // Jackson & 45th Gap to Ledge: parking + bust + spotter
  '37d7c958-aca5-4589-852f-11cd78260e9c': 'Street parking is available throughout the warehouse district block. Zero bust and no one approached during the visit. Land in the street so bring a spotter for traffic.',

  // Federal Heights Hip: spotter + ground
  'bc3b6b99-cd61-4fe0-ac05-6d6dd211674b': 'Good to have a spotter. There is a grass gap between the landing and street.',

  // Pharmacy Bank to Wallride: bust + hours (8am-6pm)
  'fb074fd5-51b8-498b-9ec2-4d21d6c1b757': 'You will get kicked out quickly. Business hours are 8am to 6pm.',

  // Penn St Metal Ledges: how to get there
  '95ac0bd8-0d37-4445-a77b-09a66a0d5d2c': 'It is next to the parking garage down ramp.',

  // Z Ledge: how to get there
  '31ace083-0847-4fc3-9fdd-1570a5d3a87d': 'Go behind Espadin LoHi to find it. It is in the alley between Zuni St and Wyandot St, across from Zuni St Brewing.',

  // Sacred Hand Rails: describes obstacles
  '365b72c5-99e4-4f86-8159-e2c914cc21ee': '',

  // Sun Plaza: describes obstacles
  '0b9dfd4a-6af9-412b-8ca9-bc1e1fe05304': '',

  // Southwest Commons Plaza Ledges: describes obstacles
  '54ee44e5-e8ae-408e-a378-548530dcab57': '',

  // Golden Circle Rail and Mitchell Spots: describes obstacles
  '5595c367-2236-4db5-9947-c9f847e5a79b': '',

  // CU Stairs & Rails: describes obstacle + ground
  '0e4abb29-45c6-48f7-aad1-7a283c2bf16c': '',

  // Greenwood Village Corporate Park: describes obstacles
  '5b73f741-0052-499b-90a4-1c6301dc7484': '',

  // Irving St Colfax Bank Spot: parking + ground
  '8bf87ba7-8fd8-47fb-8f08-e2fe9539cdd7': 'Street parking is easily available on Irving St near Colfax. The concrete planter banks have some cracks and rough patches so bring a broom. No reported bust.',

  // DTC Hubba Complex: bust + timing
  '686cedbc-642a-4311-b787-d7522699fc2b': 'Go on weekend afternoons to avoid pedestrians.',

  // Platte River Bank to Ledge: spotter (bikes on trail)
  '7d003abe-c48e-4649-ae52-727931f72a2d': 'Watch out for bikes on this trail.',

  // Riverside Baptist Stairs & Rails: bust
  'b9479f02-0292-4e00-bd73-64cfc401ed30': 'Located at a church so skate around operating hours.',

  // Rino Sidewalk Gap: parking + describes obstacle
  '52055bbb-8aeb-4fb7-acb5-f347fe2323a2': 'Parking is available in the same lot.',

  // Cherry Creek Alley Ledge: bust + timing
  '0caf5ed6-13cf-489b-83de-7f43886df244': 'Best at night when pedestrians are gone and parking is easier.',

  // Rino Container & Curb: describes obstacle
  '53922d5c-8c8d-48ae-9731-e15371604237': '',

  // Valdez Elementary Rails: describes obstacles
  'e6633321-9a37-45a8-900c-1982919d62b9': '',

  // Congress Park Circle Rail: parking + bust
  '5f5ee64a-cb07-4624-bcf7-23a14b2a4b62': 'Plenty of run up when the gate is open and street parking is all around.',

  // 45th Ave Roof Gap: parking + bust
  '5120237a-7fe2-42ab-afeb-7d501cd12a4f': 'Street parking is no problem in the industrial block area. The building is completely abandoned so no bust issues.',

  // Sloan's Lake School Rail: parking + bust + ground
  'bd2cb17f-d35e-4fb6-b710-73b30461ca36': 'Street parking is available throughout the Sloan\'s Lake neighborhood. School property so only skate outside of school hours and be respectful if asked to leave. Plywood helps bridge the grass roll away to the street.',

  // Quebec St Mini Quarter: parking + bust
  '861841a9-b23d-4906-a82d-77ac6e59359b': 'Zero bust and Planet Fitness parking is nearby.',

  // Corporate Circle School Spots: parking + bust + ground
  'dfcbd249-d79a-477b-812c-7f83824917ae': 'Parking is available all over around the complex. School property so only skate outside of school hours. The downhill slant of the sidewalk gives you speed and the landing exits toward the street.',

  // Cap Hill Alley Ledge (1d452938): parking + bust
  '1d452938-ea72-441d-b477-12d10b93a90f': 'The alley keeps bust basically nonexistent.',

  // 47th & York DIY Spot: bust + ground
  'e6a25f30-a96a-479c-80f6-85d233b3034f': 'No reported bust at this DIY street spot. The ground is smooth concrete improved over the years with layers of paint and plaster filling transitions.',

  // Mississippi Ave Alley Bank to Rail: parking + bust
  '9bdbaa9e-7ed8-4fc9-86ca-94d4c01c4818': 'Plaza parking lot is available and easy. Zero bust even with business employees going in and out the back doors. The ground is smooth concrete alley.',

  // Valverde Elementary: already fixed in Part A — skip
  '9aaaa089-acd9-4e45-b78f-241b2df7a113': 'SKIP',

  // Freddy's Leetsdale Dr 9-Stair: "run-up" hyphen + "ideal" forbidden + describes obstacle
  '2f148042-cd36-4ad6-aa5e-c83ad10b24d2': '',

  // Place Bridge Academy: "ideal" forbidden + describes obstacles; keep bust (school = after hours)
  'a7b567b7-a533-4e31-a1aa-d8b355c9f1ed': 'School property so after hours and weekends are best.',

  // Cherry Creek Mall: security + bust (describes "setup variety" = obstacle, strip it)
  'acb76698-b705-48a8-9b87-3101956f43c7': 'There is heavy security and no skateboarding signs throughout so get in and out quickly.',

  // Wynkoop St Cherry Creek Trail Bump: "features" forbidden + describes obstacle; keep how to get there
  '13ce795e-0d38-4a0c-bc07-93efd13e3b6d': 'It is on the Cherry Creek Trail at Wynkoop St and easy to find from the trail.',

  // W Colfax 1st Bank Brick Bank: "offers" forbidden + describes obstacle; keep how to get there
  'bdcdf83c-0698-406f-bf00-78baa1b0cf1a': 'It is behind the 1st Bank on W Colfax Ave alongside the drive-through lane.',

  // DPS W 7th Ave 10 Flat 10 Rail: em dash + describes obstacle; keep bust
  '1d3d1a19-a127-435c-804f-9a6eb00415d4': 'School property so weekends are best to avoid staff.',

  // Auraria Campus 12th and Walnut Staircase: describes obstacle only
  'b082fdf0-a136-480c-9042-f6346a752b2a': '',

  // Grant St Alley Handrail: parking
  '902fa7c0-4f1f-4ca1-b4d9-32f700fae3bd': 'Parking is available up and down Grant.',

  // 26th Ave Handrail: parking + ground
  '20bf251b-91cc-48e3-bb37-db35b84fe7ff': 'Street parking is available throughout the neighborhood. The run up and roll away are typical smooth sidewalk. Flower beds near the spot allow great camera angles.',

  // Clarkson St Gap to Bank: parking + spotter
  '7014f790-755b-4b9e-b5c4-81de922105fa': 'Street parking is available along Clarkson St. A spotter is recommended since this is a heavy spot and you should work up gradually. The pavement is smooth with plenty of run up.',

  // University Blvd Ditch Banks: describes obstacles
  '2aa848c5-da5b-4df8-b4aa-d9ce525660ca': '',

  // Applewood Church Bank to Curb: parking + bust + ground
  'd23e2383-9e7b-4b6c-a5ed-0a8ea36cd51c': 'The parking lot of the church is available and easy to access. Church property so go when the lot is empty. The ground is smooth concrete near the bank with some cracks and overgrowth around the edges.',

  // City View Drive Bank Gap: bust + spotter
  '271060d2-886a-4f62-8fc6-3fef601276d8': 'The house nearby said they have no issue with skating but asked not to lean on the wooden fence. Occasional traffic means you may need to wait for a gap.',

  // Lakewood Wall Ride Bank: describes obstacle
  '0c6104d9-675c-479a-96df-d771712ec3d9': '',

  // Nome St Corporate Park Banks: parking + bust
  'ad654dd3-a086-47ea-8113-e109cb69ad8e': 'Street parking is available throughout the Nome St and E 51st Ave area. One location near the first photo had management threaten to call police so stay aware of which properties are active. Most of the area is zero bust.',

  // City Park Area Ledge: describes obstacle + ground
  'f3114490-f5b6-407f-8c43-0da3c8b50d6c': '',

  // Ralston Rd Bank to Curb: parking + bust + ground
  '144851d2-fcfa-4d1a-81f8-a3f1c9d6f7bd': 'The parking lot of the closed business is wide open and easy to park. Zero bust since no one approached. The ground is cracked and rough so bring a broom for rocks.',

  // Cap Hill Bank and Curb: describes obstacles
  'dae89fdb-1f52-4860-a3df-dd6f39e3d698': '',

  // Bryant St Kinky Rail: parking + spotter
  'dc53bc96-3c65-4949-97de-2f8d20e68bd8': 'Street parking is available along Bryant St. A spotter is recommended due to proximity to street traffic at the bottom.',

  // Church Roof Gap to Bank: bust + parking
  'b32619fb-3a9a-477a-9e6f-af7b981d49f4': 'School and church property so weekends are best when lots are empty. Street parking is available throughout the neighborhood.',

  // Fort Collins Alley Ledge: bust + ground
  '5a7631d3-b484-4e80-ac7d-0f5dace95441': 'Alley location with minimal foot traffic. The concrete is smooth in both approach and roll away.',

  // Great Wall Broomfield Ledges: bust + parking
  'b242bd46-d7e4-440c-9c70-f1e8430a8d12': 'Expect to get kicked out during business hours. There is a parking lot on site.',

  // Kennedy Dr Bank: parking + foot traffic
  '37d564fa-90da-4c8b-ba1c-5c6aca449706': 'Lots of parking are in the area. Low foot traffic on weekday afternoons.',

  // Base Camp Alley Ledge: bust + parking
  'f9612aaf-054e-498e-93fe-e3b2d92cb426': 'About 20 minutes before getting asked to leave. Parking is available throughout downtown.',

  // Citadel Dr Hubba Ledge: parking + ground
  '49a46a53-3622-4cb5-8056-0f45beb760f1': 'The nearby parking lot is a bit sketchy so stay aware. The sidewalk slant affects approach height from each direction.',

  // U-Haul Bank Spot: bust + parking
  '5ea502f3-6977-4a82-99dd-68e8fcb2851f': 'Best visited outside U-Haul business hours. There is plenty of parking in the lot.',

  // Park Hill Golf Course Rail: parking + bust
  '71013fea-f188-4981-bd4d-2b0b6fea509b': 'Park on the street and push in. No security while the course is closed.',

  // Allegheny Springs Ditch: parking + ground + bust
  '89815dde-983f-404a-86c3-0f22de840d3d': 'Park on a nearby side street and walk to the ditch. It needs to be swept. Near apartments so keep it clean.',

  // Tejon St Ledge and Steps: bust + foot traffic
  '10a2e5c4-2d79-4e1c-961c-126eaa96d489': 'There is a no skateboarding sign at the stair section so be smart about timing. Foot traffic is light in this area.',

  // Cucharras Bank Ledge: parking
  '0debf85b-aca2-49cc-94a8-26a19234609e': 'Street parking is available on the road near the spot.',

  // Woodmen Euro Gap: timing + ground
  'acffbcf4-8f08-491d-a4ff-fb49536a4ba2': 'Low traffic at sunset on weekends and there is good run up with room to push around.',

  // Downtown Courthouse Waterfall Gap: parking + bust + ground
  'f241539a-cc9a-46b5-b5f0-33f810038087': 'Street parking is available throughout the surrounding downtown blocks. Security may come and ask you to leave but no issues during the visit. The run up has minor cracks but is surprisingly smooth overall.',

  // Denver Place Curved Ledges: parking + describes obstacle
  '548cd0ce-a13f-4277-a798-1ea64937bf5c': 'Street and paid parking are available throughout the downtown 18th St area.',

  // Colorado Ave Alley Ledge: parking + spotter
  '1b6f59d3-fcda-4918-b0b6-af8307c96ad3': 'Street parking is available. Right next to a parking garage so watch for cars.',

  // Bijou St Off-Ramp Ledge: how to get there + ground
  '3a45386f-7d04-400c-9a82-9eb5be3f413c': 'Park on a side street and push to the spot from the sidewalk along the off-ramp. It can be littered so bring a broom.',

  // Speer Blvd Thick Ledge: how to get there + parking
  'ff34a1ce-379c-485f-b67b-e6e0a169a6e9': 'Alley access is between Elati and 13th with shared parking lot nearby.',

  // S Parker Rd Restaurant Rails: parking + hours (vague — multiple restaurants, check hours)
  '1769581a-4c7f-422a-984c-2e6a2be24145': 'Street parking is available in the area. Check restaurant hours before visiting and skate outside of them.',

  // Littleton Loading Dock Bank (cd658de6)
  'cd658de6-0bae-40fe-804c-27a66ad09f30': 'The approach from the parking lot is easy and employees have been cool about skating here.',

  // Sidewalk Gap & Mini Ditch (a96cf25a - wrong id above)
  'a96cf25a-9674-4813-b54a-7c4e2d79a7be': '',
}

async function main() {
  // Fetch all DSL spots with descriptions
  const { data: spots, error } = await admin
    .from('spots')
    .select('id, title, description')
    .eq('credit_url', 'https://www.instagram.com/denver_spot_locator/')
    .not('description', 'is', null)
    .neq('description', '')

  if (error) throw new Error(`Fetch failed: ${error.message}`)
  console.log(`Fetched ${spots.length} spots with non-empty descriptions`)

  const results = []
  let changed = 0, skipped = 0, noChange = 0

  for (const spot of spots) {
    const newDesc = CLEANED[spot.id]

    if (newDesc === undefined) {
      // Not in our map — description looks fine already (no forbidden chars, all allowed content)
      // Check for forbidden chars anyway
      const needsFix = hasEmdash(spot.description) || hasForbidden(spot.description)
      if (needsFix) {
        console.log(`  WARNING: not in map but has issues: "${spot.title}" (${spot.id})`)
        console.log(`    desc: ${spot.description}`)
      }
      noChange++
      results.push({ id: spot.id, title: spot.title, before: spot.description, after: spot.description, changed: false, reason: 'not_in_map' })
      continue
    }

    if (newDesc === 'SKIP') {
      skipped++
      results.push({ id: spot.id, title: spot.title, before: spot.description, after: spot.description, changed: false, reason: 'skip_part_a' })
      continue
    }

    if (newDesc === spot.description) {
      noChange++
      results.push({ id: spot.id, title: spot.title, before: spot.description, after: newDesc, changed: false, reason: 'no_change' })
      continue
    }

    // Update
    const { data: updated, error: updateErr } = await admin
      .from('spots')
      .update({ description: newDesc })
      .eq('id', spot.id)
      .select('id, title, description')
      .single()

    if (updateErr || !updated) {
      console.error(`  FAILED update for "${spot.title}": ${updateErr?.message}`)
      results.push({ id: spot.id, title: spot.title, before: spot.description, after: newDesc, changed: false, reason: 'update_failed', error: updateErr?.message })
      continue
    }

    changed++
    process.stdout.write('.')
    results.push({ id: spot.id, title: spot.title, before: spot.description, after: updated.description, changed: true })
  }
  console.log()

  // Save before/after log
  const outputPath = path.resolve(__dirname, 'import-output/description-cleanup.json')
  writeFileSync(outputPath, JSON.stringify({ summary: { total: spots.length, changed, noChange, skipped }, results }, null, 2))

  console.log(`\nPART B COMPLETE`)
  console.log(`  Total spots checked : ${spots.length}`)
  console.log(`  Descriptions changed: ${changed}`)
  console.log(`  No change needed    : ${noChange}`)
  console.log(`  Skipped (Part A fix): ${skipped}`)
  console.log(`  Output saved to     : ${outputPath}`)

  // Report spots that had hours looked up
  console.log('\nBusiness hours updated:')
  console.log('  Sushi Den (73c7bda8): looked up — Mon-Fri lunch 11:30am-2pm, Sun-Thu dinner 5-9:30pm, Fri-Sat 4:30-10pm')
  console.log('  S Parker Rd Restaurant Rails (1769581a): multiple restaurants at address, kept vague "check hours"')
  console.log('  All other hour-bearing spots had hours already in the description')
}

main().catch(err => {
  console.error('\nFATAL:', err.message)
  process.exit(1)
})
