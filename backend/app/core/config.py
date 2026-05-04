from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    REDSHIFT_HOST: str
    REDSHIFT_PORT: int = 5439
    REDSHIFT_DATABASE: str
    REDSHIFT_USER: str
    REDSHIFT_PASSWORD: str
    REDSHIFT_SCHEMA: str = "KIRAN"
    
    JIRA_DOMAIN: str
    JIRA_EMAIL: str
    JIRA_TOKEN: str
    
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_EMAIL: str = ""
    SMTP_PASSWORD: str = ""
    RESEND_API_KEY: str = ""     # https://resend.com — preferred on cloud hosts that block SMTP
    RESEND_FROM_EMAIL: str = "TimeSync <onboarding@resend.dev>"  # set to your verified domain after DNS setup
    GMAIL_SENDER_EMAIL: str = ""  # e.g. kiran@expressanalytics.net — used with service account Gmail API
    CHAT_WEBHOOK_URL: str = ""   # Google Chat shared space webhook for weekly summary
    
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = ""
    GOOGLE_SERVICE_ACCOUNT_FILE: str = "service-account.json"
    GOOGLE_SERVICE_ACCOUNT_CONTENT: str = ""   # JSON string — used on Render instead of file
    GOOGLE_ADMIN_EMAIL: str = ""               # org admin email for impersonation

    # Google Login OAuth (separate from Calendar OAuth)
    GOOGLE_LOGIN_CLIENT_ID: str = ""
    GOOGLE_LOGIN_CLIENT_SECRET: str = ""
    GOOGLE_LOGIN_REDIRECT_URI: str = "http://localhost:8000/auth/google/callback"
    
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    FRONTEND_URL: str = "http://localhost:3000"
    ENVIRONMENT: str = "development"
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
