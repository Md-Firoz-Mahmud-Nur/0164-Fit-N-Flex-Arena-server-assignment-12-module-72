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
      "https://simple-firebase-module-49-a.web.app",
      "https://simple-firebase-module-49-a.firebaseapp.com",
      "https://0164-fit-n-flex-arena-server-assignment-12-module-72.vercel.app",
    ],
    credentials: true,
  })
);
app.use(express.json());

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

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
    // await client.connect();

    const fitNFlexArenaDatabase = client.db("fitNFlexArena");
    const usersCollection = fitNFlexArenaDatabase.collection("users");
    const classesCollection = fitNFlexArenaDatabase.collection("classes");
    const slotsCollection = fitNFlexArenaDatabase.collection("slots");
    const paymentsCollection = fitNFlexArenaDatabase.collection("payments");
    const subsCollection = fitNFlexArenaDatabase.collection("subs");
    const testimonialsCollection =
      fitNFlexArenaDatabase.collection("testimonials");
    const blogsCollection = fitNFlexArenaDatabase.collection("blogs");
    const upVotesCollection = fitNFlexArenaDatabase.collection("upVotes");
    const downVotesCollection = fitNFlexArenaDatabase.collection("downVotes");

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

    const verifyTrainer = async (req, res, next) => {
      const user = req.decoded;
      const query = { email: user?.email };
      const result = await usersCollection.findOne(query);
      if (!result || result?.role !== "trainer") {
        return res.status(401).send({ message: "Unauthorized Access" });
      }
      next();
    };

    app.get("/users", async (req, res) => {
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get(
      "/manageMySlots/:email",
      verifyToken,
      verifyTrainer,
      async (req, res) => {
        const email = req?.query?.email;

        if (email !== req.decoded.email) {
          return res.status(403).send({ message: "Forbidden Access" });
        }

        const trainerEmail = req.params.email;
        const query = { "trainer.email": trainerEmail };
        const result = await slotsCollection.find(query).toArray();
        res.send(result);
      }
    );

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

    app.get("/users/trainer/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let trainer = false;
      if (user) {
        trainer = user?.role === "trainer" && user?.status === "resolved";
        // trainer = user?.role === "trainer";
      }
      res.send({ trainer });
    });
    app.get("/users/member/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let member = false;
      if (user) {
        member = user?.role === "member";
      }
      res.send({ member });
    });

    app.get("/allTrainers", async (req, res) => {
      try {
        const result = await usersCollection
          .find({ status: "resolved", role: "trainer" })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: "An error occurred while fetching trainers.",
          error,
        });
      }
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

    app.get("/trainerDetails/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    app.get("/trainerSlots/:id", async (req, res) => {
      const id = req.params.id;
      const query = { "trainer.id": id, status: "available" };
      const result = await slotsCollection.find(query).toArray();
      res.send(result);
    });

    app.get(
      "/slotUser/:email",
      verifyToken,
      verifyTrainer,
      async (req, res) => {
        if (req?.decoded?.email !== req.query.email) {
          return res.status(403).send({ message: "Forbidden Access" });
        }
        const email = req.params.email;
        const query = { email: email };
        const result = await usersCollection.findOne(query);
        res.send(result);
      }
    );

    app.get("/allClassName", async (req, res) => {
      const query = {};
      const options = {
        projection: { _id: 0, name: 1 },
      };
      const result = await classesCollection.find(query, options).toArray();
      res.send(result);
    });

    app.get("/myBooked/:email", verifyToken, async (req, res) => {
      if (req?.query?.email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      const email = req.params.email;
      const query = {
        "user.email": email,
      };
      const result = await paymentsCollection.find(query).toArray();
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

    app.post("/addNewSlot", verifyToken, verifyTrainer, async (req, res) => {
      if (req?.decoded?.email !== req.query.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      const newSlots = req.body;
      const result = await slotsCollection.insertMany(newSlots);
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

    app.post("/payment", verifyToken, async (req, res) => {
      const email = req?.query?.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }

      const paymentData = req.body;
      const name = paymentData.class.cName.value;

      if (!paymentData?.class?.cName) {
        return res.status(400).send({ message: "Class name is required" });
      }

      const query = { name: { $regex: name, $options: "i" } };
      const query0 = { _id: new ObjectId(paymentData.class.sId) };

      const updateSlot = {
        $set: {
          status: "booked",
          bookedBy: {
            name: paymentData.user.name,
            email: paymentData.user.email,
            class_name: name,
          },
        },
      };

      try {
        await classesCollection.updateOne(query, { $inc: { totalBooking: 1 } });
        await slotsCollection.updateOne(query0, updateSlot);
        const result = await paymentsCollection.insertOne(paymentData);
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.post("/makePayment", verifyToken, async (req, res) => {
      const email = req?.query?.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }

      const { price } = req.body;

      const priceInCent = parseFloat(price) * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: priceInCent,
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send(user);
    });

    app.get("/activityLogs/:email", verifyToken, async (req, res) => {
      if (req?.query?.email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      const email = req.params.email;
      const query = {
        email: email,
      };
      const result = await usersCollection.find(query).toArray();
      res.send(result);
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

    app.get("/newsletter", verifyToken, verifyAdmin, async (req, res) => {
      if (req?.decoded?.email !== req.query.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      const result = await subsCollection.find().toArray();
      res.send(result);
    });

    app.post("/subs", async (req, res) => {
      const subscribeUser = req.body;
      const query = { email: subscribeUser.email };
      const isExists = await subsCollection.findOne(query);
      if (isExists) return res.send({ message: "Already subscribes" });
      const result = await subsCollection.insertOne(subscribeUser);
      res.send(result);
    });

    app.get("/balance", verifyToken, verifyAdmin, async (req, res) => {
      if (req?.query?.email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      const info = await paymentsCollection
        .aggregate([
          {
            $sort: {
              date: -1, // Sort by date field in descending order
            },
          },
          {
            $group: {
              _id: null,
              totalBalance: { $sum: "$price" },
              transactions: {
                $push: {
                  transactionId: "$transactionId",
                  price: "$price",
                  email: "$user.email",
                },
              },
              uniqueEmails: { $addToSet: "$user.email" },
            },
          },
          {
            $project: {
              _id: 0,
              totalBalance: 1,
              transactions: 1,
              paidMembers: { $size: "$uniqueEmails" },
            },
          },
        ])
        .toArray();

      const subscribesCount = await subsCollection
        .aggregate([
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
            },
          },
        ])
        .toArray();

      const chartData = [
        ["users", "count"],
        ["Paid Members", info[0].paidMembers],
        ["Newsletter Subscribers", subscribesCount[0].count],
      ];

      res.send({ info, subscribesCount, chartData });
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

    app.get("/blogs", async (req, res) => {
      const result = await blogsCollection
        .find()
        .project({ title: 1, author: 1, postDate: 1, image: 1, description: 1 })
        .sort({ postDate: -1 })
        .limit(6)
        .toArray();
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

    app.get("/featuredClass", async (req, res) => {
      const result = await classesCollection
        .aggregate([{ $sort: { totalBooking: -1 } }])
        .limit(6)
        .toArray();

      res.send(result);
    });

    app.get("/testimonials", async (req, res) => {
      const result = await testimonialsCollection.find().toArray();
      res.send(result);
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

    app.patch("/voteBlog", verifyToken, async (req, res) => {
      if (req?.decoded?.email !== req.query.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }

      const id = req.body.id;
      const vote = req.body.vote;
      const email = req.body.email;

      const query = {
        $and: [{ email: email }, { blogId: id }],
      };

      const voteData = {
        blogId: id,
        email: email,
        vote: vote,
      };

      if (vote === "like") {
        const isInUpVote = await upVotesCollection.findOne(query);
        const isInDownVote = await downVotesCollection.findOne(query);
        if (isInUpVote === null) {
          await upVotesCollection.insertOne(voteData);
          const result1 = await blogsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $inc: { likes: 1 } }
          );
        }

        if (isInDownVote !== null) {
          await downVotesCollection.deleteOne(query);
          const result2 = await blogsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $inc: { dislikes: -1 } }
          );
        }

        res.send({ success: true });
      } else {
        const isInUpVote = await upVotesCollection.findOne(query);
        const isInDownVote = await downVotesCollection.findOne(query);
        if (isInUpVote !== null) {
          await upVotesCollection.deleteOne(query);
          const result1 = await blogsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $inc: { likes: -1 } }
          );
        }

        if (isInDownVote === null) {
          await downVotesCollection.insertOne(voteData);
          const result2 = await blogsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $inc: { dislikes: 1 } }
          );
        }

        res.send({ success: true });
      }
    });

    app.get("/teams", async (req, res) => {
      const result = await usersCollection
        .find({ status: "resolved", role: "trainer" })
        .project({
          name: 1,
          photoUrl: 1,
          biography: 1,
          skills: 1,
          experience: 1,
        })
        .limit(3)
        .toArray();
      res.send(result);
    });

    app.get("/user/role/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result.role);
    });

    app.post("/addBlog", verifyToken, async (req, res) => {
      if (req?.decoded?.email !== req.query.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      const newBlog = req.body;

      const result = await blogsCollection.insertOne(newBlog);
      res.send(result);
    });

    app.get("/forum", async (req, res) => {
      const page = parseInt(req.query.page);
      const totalBlogs = await blogsCollection.countDocuments();
      const blogs = await blogsCollection
        .find()
        .sort({ postDate: -1 })
        .skip(page * 6)
        .limit(6)
        .toArray();
      res.send({ blogs, totalBlogs });
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

    app.get("/forumDetails/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await blogsCollection.findOne(query);
      res.send(result);
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

    app.delete(
      "/deleteSlot/:id",
      verifyToken,
      verifyTrainer,
      async (req, res) => {
        const email = req?.query?.email;
        const id = req.params.id;
        if (email !== req.decoded.email) {
          return res.status(403).send({ message: "Forbidden Access" });
        }
        const query = { _id: new ObjectId(id) };
        const result = await slotsCollection.deleteOne(query);
        res.send(result);
      }
    );

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
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
