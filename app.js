require("dotenv").config();

const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || "shop";
const COLLECTION_NAME = process.env.COLLECTION_NAME || "products";

if (!MONGO_URI) {
  console.error("Missing MONGO_URI in environment variables.");
  process.exit(1);
}

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.use(express.json());

let productsCollection;

MongoClient.connect(MONGO_URI)
  .then((client) => {
    const db = client.db(DB_NAME);
    productsCollection = db.collection(COLLECTION_NAME);
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

app.use((req, res, next) => {
  if (!productsCollection) {
    return res.status(503).json({ error: "Database not ready yet. Try again in a moment." });
  }
  next();
});

app.get("/", (req, res) => {
  res.json({
    links: ["/api/products", "/api/products/:id"],
  });
});

app.get("/api/products", async (req, res) => {
  try {
    const { category, minPrice, sort, fields } = req.query;

    const filter = {};
    const options = {};

    if (category) filter.category = category;

    if (minPrice !== undefined) {
      const mp = Number(minPrice);
      if (Number.isNaN(mp)) return res.status(400).json({ error: "minPrice must be a number" });
      filter.price = { $gte: mp };
    }

    if (sort) {
      if (sort === "price") options.sort = { price: 1 };
      else if (sort === "-price") options.sort = { price: -1 };
      else return res.status(400).json({ error: 'sort must be "price" or "-price"' });
    }

    if (fields) {
      const projection = {};
      fields.split(",").map(s => s.trim()).filter(Boolean).forEach((f) => (projection[f] = 1));
      options.projection = projection;
    }

    const products = await productsCollection.find(filter, options).toArray();

    res.json({ count: products.length, products });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid id" });

    const product = await productsCollection.findOne({ _id: new ObjectId(id) });
    if (!product) return res.status(404).json({ error: "Not found" });

    res.json(product);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/products", async (req, res) => {
  try {
    const { name, price, category } = req.body;

    if (!name || price === undefined || !category) {
      return res.status(400).json({ error: "Missing required fields: name, price, category" });
    }

    const p = Number(price);
    if (Number.isNaN(p)) return res.status(400).json({ error: "price must be a number" });

    const result = await productsCollection.insertOne({ name, price: p, category });

    res.status(201).json({
      message: "Product created",
      id: result.insertedId,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.put("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid id" });

    const { name, price, category } = req.body;

    // allow partial updates, but require at least one field
    if (name === undefined && price === undefined && category === undefined) {
      return res.status(400).json({ error: "Provide at least one field: name, price, category" });
    }

    const update = {};
    if (name !== undefined) update.name = name;
    if (category !== undefined) update.category = category;
    if (price !== undefined) {
      const p = Number(price);
      if (Number.isNaN(p)) return res.status(400).json({ error: "price must be a number" });
      update.price = p;
    }

    const result = await productsCollection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: update },
      { returnDocument: "after" }
    );

    if (!result.value) return res.status(404).json({ error: "Not found" });

    res.json({ message: "Product updated", product: result.value });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid id" });

    const result = await productsCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Not found" });

    res.json({ message: "Product deleted" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
