const express = require("express");
const app = express();
const mongoose = require("mongoose");
const Listing = require("./models/listing.js");
const Review = require("./models/review.js");
const path = require("path");
const methodOverride = require("method-override");
const session = require("express-session");
const flash = require("connect-flash");

const MONGO_URL = "mongodb://127.0.0.1:27017/wanderlust";

main()
  .then(() => {
    console.log("connected to DB");
  })
  .catch((err) => {
    console.log(err);
  });

async function main() {
  await mongoose.connect(MONGO_URL);
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));

// Session & Flash
app.use(
  session({
    secret: "wanderlust-secret-key-2024",
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 },
  })
);
app.use(flash());

// Make flash messages & categories available to all views
app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  next();
});

const CATEGORIES = [
  "Beach",
  "Mountain",
  "City",
  "Castle",
  "Camping",
  "Farm",
  "Skiing",
  "Arctic",
  "Tropical",
  "Desert",
];

// =========== ROOT ===========
app.get("/", (req, res) => {
  res.redirect("/listings");
});

// =========== WISHLIST PAGE ===========
app.get("/wishlist", (req, res) => {
  res.render("listings/wishlist.ejs");
});

// =========== INDEX ROUTE ===========
app.get("/listings", async (req, res) => {
  try {
    const { search, category, sort, minPrice, maxPrice } = req.query;

    // Build query object
    let query = {};
    if (category && category !== "All") {
      query.category = category;
    }
    if (search) {
      const regex = new RegExp(search, "i");
      query.$or = [{ title: regex }, { location: regex }, { country: regex }];
    }
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    // Build sort
    let sortOption = {};
    if (sort === "price_asc") sortOption = { price: 1 };
    else if (sort === "price_desc") sortOption = { price: -1 };
    else if (sort === "newest") sortOption = { createdAt: -1 };

    const allListings = await Listing.find(query)
      .populate({ path: "reviews" })
      .sort(sortOption);

    res.render("listings/index.ejs", {
      allListings,
      CATEGORIES,
      activeCategory: category || "All",
      search: search || "",
      sort: sort || "",
      minPrice: minPrice || "",
      maxPrice: maxPrice || "",
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Something went wrong loading listings.");
    res.redirect("/");
  }
});

// =========== NEW ROUTE ===========
app.get("/listings/new", (req, res) => {
  res.render("listings/new.ejs", { CATEGORIES });
});

// =========== SHOW ROUTE ===========
app.get("/listings/:id", async (req, res) => {
  try {
    let { id } = req.params;
    const listing = await Listing.findById(id).populate({
      path: "reviews",
      options: { sort: { createdAt: -1 } },
    });
    if (!listing) {
      req.flash("error", "Listing not found!");
      return res.redirect("/listings");
    }

    // Compute average rating
    let avgRating = 0;
    if (listing.reviews && listing.reviews.length > 0) {
      const sum = listing.reviews.reduce((acc, r) => acc + r.rating, 0);
      avgRating = (sum / listing.reviews.length).toFixed(1);
    }

    res.render("listings/show.ejs", { listing, avgRating, CATEGORIES });
  } catch (err) {
    console.error(err);
    req.flash("error", "Listing not found.");
    res.redirect("/listings");
  }
});

// =========== CREATE ROUTE ===========
app.post("/listings", async (req, res) => {
  try {
    const newListing = new Listing(req.body.listing);
    await newListing.save();
    req.flash("success", "🎉 New listing created successfully!");
    res.redirect("/listings");
  } catch (err) {
    console.error(err);
    req.flash("error", "Failed to create listing. Please check your inputs.");
    res.redirect("/listings/new");
  }
});

// =========== EDIT ROUTE ===========
app.get("/listings/:id/edit", async (req, res) => {
  try {
    let { id } = req.params;
    const listing = await Listing.findById(id);
    if (!listing) {
      req.flash("error", "Listing not found!");
      return res.redirect("/listings");
    }
    res.render("listings/edit.ejs", { listing, CATEGORIES });
  } catch (err) {
    req.flash("error", "Could not load listing for editing.");
    res.redirect("/listings");
  }
});

// =========== UPDATE ROUTE ===========
app.put("/listings/:id", async (req, res) => {
  try {
    let { id } = req.params;
    await Listing.findByIdAndUpdate(id, { ...req.body.listing });
    req.flash("success", "✅ Listing updated successfully!");
    res.redirect(`/listings/${id}`);
  } catch (err) {
    console.error(err);
    req.flash("error", "Failed to update listing.");
    res.redirect(`/listings/${req.params.id}/edit`);
  }
});

// =========== DELETE ROUTE ===========
app.delete("/listings/:id", async (req, res) => {
  try {
    let { id } = req.params;
    const listing = await Listing.findById(id);
    if (listing && listing.reviews.length > 0) {
      await Review.deleteMany({ _id: { $in: listing.reviews } });
    }
    await Listing.findByIdAndDelete(id);
    req.flash("success", "🗑️ Listing deleted.");
    res.redirect("/listings");
  } catch (err) {
    console.error(err);
    req.flash("error", "Failed to delete listing.");
    res.redirect("/listings");
  }
});

// =========== CREATE REVIEW ROUTE ===========
app.post("/listings/:id/reviews", async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      req.flash("error", "Listing not found.");
      return res.redirect("/listings");
    }
    const newReview = new Review(req.body.review);
    listing.reviews.push(newReview);
    await newReview.save();
    await listing.save();
    req.flash("success", "⭐ Review added! Thank you for your feedback.");
    res.redirect(`/listings/${req.params.id}`);
  } catch (err) {
    console.error(err);
    req.flash("error", "Could not submit review.");
    res.redirect(`/listings/${req.params.id}`);
  }
});

// =========== DELETE REVIEW ROUTE ===========
app.delete("/listings/:id/reviews/:reviewId", async (req, res) => {
  try {
    const { id, reviewId } = req.params;
    await Listing.findByIdAndUpdate(id, { $pull: { reviews: reviewId } });
    await Review.findByIdAndDelete(reviewId);
    req.flash("success", "Review deleted.");
    res.redirect(`/listings/${id}`);
  } catch (err) {
    console.error(err);
    req.flash("error", "Could not delete review.");
    res.redirect(`/listings/${req.params.id}`);
  }
});

// =========== 404 HANDLER ===========
app.use((req, res) => {
  res.status(404).render("listings/index.ejs", {
    allListings: [],
    CATEGORIES,
    activeCategory: "All",
    search: "",
    sort: "",
    minPrice: "",
    maxPrice: "",
  });
});

app.listen(8080, () => {
  console.log("server is listening to port 8080");
});
