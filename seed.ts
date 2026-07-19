import { db } from './server/db.js';
import { launches, users } from './shared/schema.js';

async function seedDatabase() {
  const existingLaunches = await db.select().from(launches);
  if (existingLaunches.length === 0) {
    const [user] = await db.insert(users).values({
      telegramId: "123456",
      username: "crypto_whale",
      walletAddress: "0x0000000000000000000000000000000000000001",
      encryptedPrivateKey: "dummy_key",
    }).returning();
    
    await db.insert(launches).values([
      {
        userId: user.id,
        coinName: "Doge Killer",
        ticker: "SHIB2",
        status: "successful",
        pumpUrl: "https://app.uniswap.org/explore/tokens/robinhood/0xshib2",
        mintAddress: "0x0000000000000000000000000000000000000002"
      },
      {
        userId: user.id,
        coinName: "Pepe AI",
        ticker: "PAI",
        status: "pending",
        imageUrl: "https://app.uniswap.org/explore/tokens/robinhood/0xpai"
      },
      {
        userId: user.id,
        coinName: "Ape Moon",
        ticker: "APEM",
        status: "successful",
        pumpUrl: "https://app.uniswap.org/explore/tokens/robinhood/0xapem"
      }
    ]);
    console.log("Seeded database with dummy data");
  } else {
    console.log("Database already seeded");
  }
}

seedDatabase().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
