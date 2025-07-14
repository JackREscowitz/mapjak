# Mapjak

📍 **Mapjak** is a photo map web app — upload images with GPS data, pin them to an interactive map, and manage your uploads securely.

---

## ✨ Features

- **User Accounts** — Simple username/password login.
- **Photo Uploads** — Upload photos with EXIF GPS metadata. No GPS = no upload.
- **Cloud Storage** — Photos are stored on AWS S3.
- **Map View** — All uploads show on a Leaflet map with custom user icons.
- **Ownership** — Only the uploader can delete their photos.
- **Protected Routes** — Uploads and map pages require login.
- **Fully Cloud-Based** — Database on Railway Postgres + S3 for files.

---

## 🗂️ Tech Stack

- **Backend:** Node.js + Express
- **Database:** PostgreSQL (Railway)
- **Storage:** AWS S3 (via `@aws-sdk/client-s3`)
- **Auth:** Cookie-based sessions (`express-session`)
- **Frontend:** Plain HTML, CSS (Manrope), Leaflet.js for maps

---

## 🚀 Getting Started (Local)

1. **Clone**
   ```bash
   git clone https://github.com/JackREscowitz/mapjak.git
   cd mapjak
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up `.env`**

   ```dotenv
   DATABASE_URL=postgresql://...
   SESSION_SECRET=your_secret_here
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=your_access_key_id
   AWS_SECRET_ACCESS_KEY=your_secret_access_key
   S3_BUCKET=your_bucket_name
   ```

4. **Run it**

   ```bash
   node server.js
   ```

5. Visit: [http://localhost:3000](http://localhost:3000)

---

## ⚙️ Deployment

* This app is deployed to Railway.
* Use `prod` branch for production.
* Push to `prod` → Railway auto-builds and redeploys.

---

## 📝 Notes

* **Uploads must have GPS EXIF data!**
  (Phones usually add this automatically if location is enabled.)

* **Sessions use cookies:**
  Make sure `trust proxy` is set if behind Railway’s proxy.

* **Images stored:**
  Local `/uploads` only stores temp files — final images live on S3.

---

## 🔒 Security

* No plain-text passwords: user passwords are hashed (bcrypt).
* Sessions cookies are `SameSite=Lax` and `Secure` in production.
* File uploads check `mimetype` to block non-image files.

---

## ✅ To Do (Future)

* Add user registration flow.

---

**Built with ❤️ by Jack Escowitz**

