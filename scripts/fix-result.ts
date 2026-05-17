// One-time fix script: correct a wrongly resolved match
// Usage: npx tsx scripts/fix-result.ts "Al Shabab" "Al Ittihad" 3 2
import { PrismaClient } from '@prisma/client';
import { evaluateSelection, evaluateDouble } from '../src/lib/services/resultEvaluator';

const prisma = new PrismaClient();

async function main() {
  const [, , home, away, homeScoreStr, awayScoreStr] = process.argv;
  if (!home || !away || !homeScoreStr || !awayScoreStr) {
    console.error('Usage: npx tsx scripts/fix-result.ts "Home Team" "Away Team" homeScore awayScore');
    process.exit(1);
  }

  const homeScore = parseInt(homeScoreStr);
  const awayScore = parseInt(awayScoreStr);

  const sel = await prisma.betSelection.findFirst({
    where: {
      homeTeam: { contains: home, mode: 'insensitive' },
      awayTeam: { contains: away, mode: 'insensitive' },
    },
    include: { double: { include: { selections: true } } },
  });

  if (!sel) {
    console.error(`Selection not found: ${home} vs ${away}`);
    process.exit(1);
  }

  console.log(`Found: ${sel.homeTeam} vs ${sel.awayTeam}`);
  console.log(`  Market: ${sel.market}, Line: ${sel.line}`);
  console.log(`  Old score: ${sel.homeScore}-${sel.awayScore} → ${sel.resultStatus}`);

  const newStatus = evaluateSelection({ market: sel.market, line: sel.line, homeScore, awayScore });
  console.log(`  New score: ${homeScore}-${awayScore} → ${newStatus}`);

  await prisma.betSelection.update({
    where: { id: sel.id },
    data: { homeScore, awayScore, resultStatus: newStatus },
  });

  // Re-evaluate the double
  const allSels = await prisma.betSelection.findMany({ where: { doubleId: sel.doubleId } });
  const statuses = allSels.map((s) => (s.id === sel.id ? newStatus : s.resultStatus)) as any[];
  const newDoubleStatus = evaluateDouble(statuses);

  await prisma.betDouble.update({
    where: { id: sel.doubleId },
    data: { status: newDoubleStatus },
  });

  console.log(`  Double ${sel.doubleId} → ${newDoubleStatus}`);
  console.log('Done.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
