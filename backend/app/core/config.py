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
    SMTP_EMAIL: str
    SMTP_PASSWORD: str
    
    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str
    GOOGLE_REDIRECT_URI: str
    GOOGLE_SERVICE_ACCOUNT_FILE: str = "service-account.json"
    GOOGLE_ADMIN_EMAIL: str = ""          # org admin email for impersonation
    
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    FRONTEND_URL: str = "http://localhost:3000"
    ENVIRONMENT: str = "development"
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
