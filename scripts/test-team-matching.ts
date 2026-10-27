// npm run test:names — positive and negative cases for teamsMatch (src/lib/services/fstResultFetcher.ts).
// Add a case here whenever an alias or a matching rule is added or changed; exits with code 1 on any problem.
import { teamsMatch } from '../src/lib/services/fstResultFetcher';

// Must match: same club, different spelling between sources.
const SAME: [string, string][] = [
  ['O. Petrolero', 'Oriente Petrolero'], ['Uni de Vinto', 'Universitario de Vinto'], ['Al Akhdoud', 'Al Okhdood'], ['Caracas', 'Caracas FC'],
  ['Farnham', 'Farnham Town'], ['Man Utd', 'Manchester United'], ['Celta de Vigo', 'Celta Vigo'], ['Beşiktaş', 'Besiktas'], ['PSG', 'Paris Saint-Germain'],
  ['Hearts', 'Heart of Midlothian'], ['AC Milan', 'Milan'], ['AS Roma', 'Roma'], ['Bayern München', 'Bayern Munich'], ['Paris SG', 'Paris Saint-Germain'],
  ['A.F.C. Bournemouth', 'AFC Bournemouth'], ['Nordsjælland', 'FC Nordsjælland'], ['Lyon', 'Olympique Lyonnais'], ['Beveren', 'SK Beveren'], ['Genk', 'KRC Genk'],
  ['Como', 'Como 1907'], ['Atlético de Madrid', 'Atletico Madrid'], ['Rennes', 'Stade Rennais'], ['Slavia Praha', 'Slavia Prague'], ['MK Dons', 'Milton Keynes Dons'],
  ['Köln', 'FC Cologne'], ['Köln', 'Cologne'], ['Köln', 'FC Köln'], ["Borussia M'gladbach", 'Borussia Mönchengladbach'], ['ES Zarzis', 'Esperence Sportive de Zarzis'],
  ['Celta de Vigo II', 'RC Celta Fortuna'], ['Lillestrøm', 'Lillestrom'], ['Manchester United FC', 'Man Utd'], ['Man City U21', 'Manchester City U21'],
  ['PSV II', 'Jong PSV'], ['Nordsjælland', 'Nordsjaelland'], ['Paris FC', 'Paris FC'], ['Dundee United', 'Dundee United'], ['Hoffenheim', 'TSG Hoffenheim'],
  ['Betis', 'Real Betis'], ['Dortmund', 'Borussia Dortmund'], ['Brighton', 'Brighton & Hove Albion'], ['Brugge', 'Club Brugge KV'],
  ['Bayer Leverkusen', 'Bayer 04 Leverkusen'], ['Wolverhampton', 'Wolverhampton Wanderers'], ['Mallorca', 'RCD Mallorca'], ['Stuttgart', 'VfB Stuttgart'],
  ['Fortuna Köln', 'Fortuna Köln'],
];

// Must NOT match: different clubs that share a word, a prefix or a similar spelling (every one of these was a real false positive).
const DIFFERENT: [string, string][] = [
  ['Manchester United', 'Manchester City'], ['Real Madrid', 'Real Sociedad'], ['Athletic Bilbao', 'Atletico Madrid'], ['Inter Milan', 'AC Milan'],
  ['Sporting CP', 'Sporting Gijon'], ['Al Ahli', 'Al Hilal'], ['Dinamo Zagreb', 'Dinamo Kyiv'], ['Bayern Munich', 'Bayer Leverkusen'], ['Lommel', 'OH Leuven'],
  ['Universitario de Vinto', 'Universitario de Deportes'], ['Brighton', 'Brentford'], ['AS Roma', 'AS Monaco'], ['Cagliari', 'F.C. København'],
  ['Csikszereda', 'F.C. København'], ['Torino', 'AFC Toronto'], ['AS Roma', 'F.C. København'], ['Karlsruhe', 'F.C. København'], ['Como', 'Halifax Tides FC'],
  ['Odense', 'Oldham Athletic'], ['Hearts', 'Sacred Heart'], ['Atalanta', 'Atlanta United FC'], ['Aris', 'Paris Saint-Germain'], ['Porto', 'Port Vale'],
  ['Bay FC', 'Bayern Munich'], ['Lyon', 'OL Lyonnes'], ['Köln', 'Colonia Sacramento'], ['Rennes', 'Stade Brestois'], ['Slavia Praha', 'Slavia Sofia'],
  ['Real Betis', 'Real Madrid'], ['Inter Miami', 'Inter Milan'], ['Inter Miami', 'Inter'], ['PSV', 'Jong PSV'], ['Ajax', 'Jong Ajax'],
  ['Real Sociedad', 'Real Sociedad II'], ['Arsenal', 'Arsenal U21'], ['Al Rayyan SC B', 'Al-Rayyan SC'], ['Sport', 'ES Zarzis'],
  ['Sport', 'Esperence Sportive de Zarzis'], ['Barcelona', 'Barcelona Women'], ['Newcastle United', 'Newcastle Jets'], ['Sheffield United', 'Sheffield Wednesday'],
  ['Fortuna Köln', 'FC Cologne'], ['Fortuna Köln', 'Köln'], ['Fortuna Köln', 'FC Köln'], ['Paris FC', 'Paris Saint-Germain'], ['Dundee', 'Dundee United'],
];

let bad = 0;
for (const [a, b] of SAME) if (!teamsMatch(a, b)) { bad++; console.log('MISS   (should match)    ', a, '|', b); }
for (const [a, b] of DIFFERENT) if (teamsMatch(a, b)) { bad++; console.log('FALSE+ (should not match)', a, '|', b); }
console.log(bad === 0 ? `ALL OK (${SAME.length} same-club, ${DIFFERENT.length} different-club cases)` : `${bad} problem(s)`);
process.exit(bad === 0 ? 0 : 1);
