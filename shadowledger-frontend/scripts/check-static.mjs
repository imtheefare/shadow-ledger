import * as fs from "fs";
import * as path from "path";

const errors = [];

function checkDirectory(dir, relativePath = "") {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.join(relativePath, entry.name);

    if (entry.isDirectory()) {
      // Check for dynamic routes
      if (entry.name.includes("[") || entry.name.includes("]")) {
        // Check if generateStaticParams exists
        const generateStaticParamsPath = path.join(fullPath, "generateStaticParams.ts");
        const generateStaticParamsPathTsx = path.join(fullPath, "generateStaticParams.tsx");
        
        if (!fs.existsSync(generateStaticParamsPath) && !fs.existsSync(generateStaticParamsPathTsx)) {
          errors.push(`Dynamic route ${relPath} missing generateStaticParams`);
        }
      }

      // Skip node_modules and .next
      if (entry.name !== "node_modules" && entry.name !== ".next" && entry.name !== "out") {
        checkDirectory(fullPath, relPath);
      }
    } else if (entry.isFile()) {
      // Check for server-only imports
      if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        const content = fs.readFileSync(fullPath, "utf-8");
        
        // Check for forbidden imports
        const forbiddenPatterns = [
          /from ['"]next\/headers['"]/,
          /from ['"]next\/server['"]/,
          /from ['"]server-only['"]/,
          /getServerSideProps/,
          /getStaticProps/,
          /getInitialProps/,
          /dynamic\s*=\s*['"]force-dynamic['"]/,
        ];

        for (const pattern of forbiddenPatterns) {
          if (pattern.test(content)) {
            errors.push(`File ${relPath} contains forbidden pattern: ${pattern}`);
          }
        }
      }
    }
  }
}

// Check app directory
const appDir = path.resolve("./app");
if (fs.existsSync(appDir)) {
  checkDirectory(appDir, "app");
}

// Check for API routes
const apiDir = path.resolve("./app/api");
if (fs.existsSync(apiDir)) {
  errors.push("API routes (app/api) are not allowed in static export");
}

const pagesApiDir = path.resolve("./pages/api");
if (fs.existsSync(pagesApiDir)) {
  errors.push("API routes (pages/api) are not allowed in static export");
}

if (errors.length > 0) {
  console.error("\n❌ Static export check failed:\n");
  errors.forEach((error) => console.error(`  - ${error}`));
  process.exit(1);
} else {
  console.log("✅ Static export check passed");
}

