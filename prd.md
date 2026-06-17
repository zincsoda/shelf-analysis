1. Product Overview
Product Name
ShelfSight (working title)

Purpose
A web application that allows authenticated users to upload images of supermarket shelf areas and receive an AI-generated estimate of the percentage of empty shelf space.

The system uses OpenRouter to select and call multimodal vision models dynamically.

2. Goals
Allow admin-managed user accounts
Secure login/logout
Role-based access control (admin, user)
Image upload & storage
Model selection via OpenRouter
Structured AI response with:
Empty shelf percentage
Confidence score
Short explanation
Persistent storage of analysis results
Hosted fully on Cloudflare
3. Technical Architecture
Platform
Cloudflare Pages (Frontend)
Cloudflare Workers (API)
Cloudflare D1 (Database)
Cloudflare R2 (Image storage)
OpenRouter API (Vision models)
4. User Roles
Admin
Login
Create users
Disable users
Reset passwords
View all analyses
Assign roles
User
Login
Upload shelf images
Select AI model
View their own analysis history
5. Core Functional Requirements
5.1 Authentication
Email + password login
Password hashed using PBKDF2
JWT stored in HttpOnly secure cookie
Session expiration: 7 days
Role-based middleware
5.2 Admin User Management
Admin must be able to:

Create user (email, password, role)
Edit role
Deactivate user
Delete user
Reset password
5.3 Image Upload
Accept image (JPEG/PNG/WebP)
Resize/compress client-side (max 1024px width)
Upload to Worker
Store original in R2
Return storage URL
5.4 AI Analysis
User selects model from dropdown:

openai/gpt-4.1
google/gemini-2.0-flash-exp
anthropic/claude-3.5-sonnet
meta-llama/llama-3.2-90b-vision-instruct
Worker sends request to OpenRouter with:

Prompt:

"Analyze this supermarket shelf image. Estimate the percentage of empty shelf space. Return ONLY valid JSON in the format:

{
"empty_percentage": number,
"confidence": number (0-1),
"analysis": "short explanation"
}
"

5.5 Data Storage
Users Table
id
email
password_hash
role
is_active
created_at
Analyses Table
id
user_id
image_url
model_used
empty_percentage
confidence
analysis_text
created_at
5.6 Dashboard
User dashboard:

Upload new image
Select model
View result
View history
Admin dashboard:

Manage users
View all analyses
6. Non-Functional Requirements
All API routes secured
Rate limit login attempts
Validate file size (max 5MB)
Validate file type
Store secrets in Cloudflare environment variables
Proper error handling
Structured JSON responses
No API keys exposed to frontend
7. API Endpoints
Auth
POST /api/login
POST /api/logout
GET /api/me
Admin
GET /api/admin/users
POST /api/admin/users
PUT /api/admin/users/:id
DELETE /api/admin/users/:id
Analysis
POST /api/analyze
GET /api/analyses
GET /api/analyses/:id
8. Security Requirements
JWT verification middleware
Role-based access control
Secure cookies (HttpOnly, SameSite=Strict)
Input validation
No public R2 buckets
Signed URLs for image access
9. Future Enhancements (Not Required for MVP)
2FA
Usage quotas
Billing tiers
Audit logs
CSV export
Shelf trend analytics
