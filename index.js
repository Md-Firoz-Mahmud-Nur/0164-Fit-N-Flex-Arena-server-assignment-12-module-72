const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
    ],
    credentials: true,
  })
);
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_SECRET_KEY}@cluster0.fp5eepf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server (optional starting in v4.7)
    await client.connect();

    const fitNFlexArenaDatabase = client.db("fitNFlexArena");
    const usersCollection = fitNFlexArenaDatabase.collection("users");
    const classesCollection = fitNFlexArenaDatabase.collection("classes");

    // JWT
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // Middleware
    const verifyToken = (req, res, next) => {
      console.log("inside verify token", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    app.get("/users", async (req, res) => {
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    app.get("/classes", async (req, res) => {
      try {
        const { page = 0, search = "" } = req.query;
        const limit = 6;
        const skip = page * limit;

        const query = search ? { name: { $regex: search, $options: "i" } } : {};

        const result = await classesCollection
          .aggregate([
            { $match: query },
            { $skip: skip },
            { $limit: limit },
            {
              $lookup: {
                from: "users",
                let: { className: "$name" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          {
                            $in: ["$$className", { $ifNull: ["$skills", []] }],
                          },
                          { $eq: ["$status", "resolved"] },
                          { $eq: ["$role", "trainer"] },
                        ],
                      },
                    },
                  },
                  { $project: { photoUrl: 1, _id: 1, role: 1, status: 1 } },
                ],
                as: "trainer",
              },
            },
            {
              $project: {
                name: 1,
                description: 1,
                image: 1,
                trainer: 1,
              },
            },
          ])
          .toArray();

        const matchedTrainers = await classesCollection.countDocuments(query);

        res.json({ result, matchedTrainers });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.get("/allClassName", async (req, res) => {
      const query = {};
      const options = {
        projection: { _id: 0, name: 1 },
      };
      const result = await classesCollection.find(query, options).toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.post("/addNewClass", verifyToken, verifyAdmin, async (req, res) => {
      if (req?.decoded?.email !== req.query.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      const newClass = req.body;

      const result = await classesCollection.insertOne(newClass);
      res.send(result);
    });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send(user);
    });

    app.get("/usersPending", async (req, res) => {
      console.log("pending hit");
      try {
        const query = { status: "pending" };
        const pendingUsers = await usersCollection.find(query).toArray();
        console.log("Pending users found:", pendingUsers);
        res.json(pendingUsers);
      } catch (error) {
        console.error("Error fetching pending users:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    app.get("/usersTrainer", async (req, res) => {
      console.log("Trainer Hit");
      try {
        const query = { role: "trainer" };
        const trainers = await usersCollection.find(query).toArray();
        console.log("Trainer found:", trainers);
        res.json(trainers);
      } catch (error) {
        console.error("Error fetching trainers:", error);
        res.status(500).send("Internal Server Error");
      }
    });

    app.get("/appliedTrainerDetail/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    app.put("/users/:email", async (req, res) => {
      const email = req.params.email;
      console.log(email);
      const userData = req.body;
      console.log(userData);
      const query = { email: email };
      const update = {
        $set: userData,
      };
      const options = { upsert: true };

      const result = await usersCollection.updateOne(query, update, options);
      if (result.upsertedCount > 0) {
        res.send({ message: "User created successfully", result });
      } else if (result.modifiedCount > 0) {
        res.send({ message: "User updated successfully", result });
      } else {
        res.send({ message: "No changes made to the user", result });
      }
    });

    app.put("/users/:id/statusResolved", async (req, res) => {
      const userId = req.params.id;
      const { status, role } = req.body;
      try {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(userId) },
          { $set: { status: status, role: role } }
        );

        if (result.modifiedCount > 0) {
          res
            .status(200)
            .send({ message: "User status and role updated successfully" });
        } else {
          res
            .status(404)
            .send({ message: "User not found or no changes made" });
        }
      } catch (error) {
        console.error("Error updating user status and role:", error);
        res.status(500).send({ message: "An error occurred", error });
      }
    });
    app.put("/users/:id/statusReject", async (req, res) => {
      const userId = req.params.id;
      const { status, feedback } = req.body;
      try {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(userId) },
          { $set: { status: status, feedback: feedback } }
        );

        if (result.modifiedCount > 0) {
          res
            .status(200)
            .send({ message: "User status and role updated successfully" });
        } else {
          res
            .status(404)
            .send({ message: "User not found or no changes made" });
        }
      } catch (error) {
        console.error("Error updating user status and role:", error);
        res.status(500).send({ message: "An error occurred", error });
      }
    });
    app.put("/users/:id/roleMember", async (req, res) => {
      const userId = req.params.id;
      const { role } = req.body;
      try {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(userId) },
          { $set: { role: role } }
        );

        if (result.modifiedCount > 0) {
          res
            .status(200)
            .send({ message: "User status and role updated successfully" });
        } else {
          res
            .status(404)
            .send({ message: "User not found or no changes made" });
        }
      } catch (error) {
        console.error("Error updating user status and role:", error);
        res.status(500).send({ message: "An error occurred", error });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Fit-N`-Flex-Arena-server");
});

app.listen(port, () => {
  console.log(`Fit-N-Flex-Arena-server listening on port ${port}`);
});
