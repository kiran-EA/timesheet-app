# ⚡ QUICK START - 3 Commands to Running App

Copy and paste these commands to get started in **10 minutes**!

---

## 🔥 FASTEST PATH

### Step 1: Backend (Terminal 1)

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env: Add SECRET_KEY (generate below)
python -c "import secrets; print('Copy this SECRET_KEY:', secrets.token_urlsafe(32))"
# Update SECRET_KEY in .env, then:
uvicorn app.main:app --reload
```

**✅ Test**: http://localhost:8000/docs

### Step 2: Frontend (Terminal 2)

```bash
cd frontend
npm install
npm run dev
```

**✅ Test**: http://localhost:3000

### Step 3: Login

1. Go to http://localhost:3000
2. Enter: `kiran@expressanalytics.net`
3. Click "Sign In"
4. ✅ Success! You're in!

---

## 🎯 What You'll See

1. **Login Page** - Dark gradient design
2. **Dashboard** - Sidebar + Header
3. **Timesheet Page** - 4 stat cards + placeholder

---

## 📝 All Your Credentials Are Ready!

No setup needed - everything is in `.env.example`:
- ✅ Jira API
- ✅ Redshift
- ✅ Gmail SMTP
- ✅ Google Calendar

Just generate `SECRET_KEY` and you're done!

---

## 🚀 Time to Complete

- Backend setup: **5 minutes**
- Frontend setup: **5 minutes**
- **Total: 10 minutes**

---

**Let's go! 🎉**
