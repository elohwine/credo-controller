SGK construction company is a maintenance company. So what happens is we get jobs from the client and how the client send the jobs is either by email or by purchase orders, yeah? Right, so when we get the purchase order, the system, we have got to go into the system, generate a job card using that purchase order. Right? And these pictures, what does it tell? They come with pictures, you know, the description one is doing. So that job card, when it's created, we schedule our teams to say, okay, if I, you know, there's a PO, we allocate that to Farai or burn or add more to do certain jobs. Okay? Then from there, when they do the job, when they tend to go to the shop or to the house or wherever, where they need to do the job, they take pictures before, after. When they buy materials, they will attach the receipts. When they complete the job, they will close it and that job will go straight to the office. if we can have emails integrated into this and have a section for job cards and then you can attach the email and the documents, then you always have the chain of that as well, along with obviously having the statuses and the upload at the end.

I'll help you build a comprehensive job management system for SGK construction company. This will track the entire lifecycle from purchase order to job completion, with team assignments, photo uploads, receipts, and email integration.

Let me start by setting up the Supabase integration which will be essential for storing jobs, documents, team data, and file uploads.

I'll help you build this job management system for SGK construction company.

For a system like this that needs to track jobs, store documents, manage team assignments, and handle file uploads (photos, receipts, emails), you'll need database storage and file management capabilities.

Would you like to connect to Supabase? This will enable:

Persistent storage for purchase orders, job cards, and team assignments
File storage for photos (before/after), receipts, and email attachments
Real-time status updates as teams work on jobs
Secure data management for your job tracking workflow
Note: Make is designed for prototyping and development. It's not intended for collecting PII (personally identifiable information) or securing highly sensitive business data in production.

Let me present the connection modal:


Once you've connected your Supabase project, I'll build the complete job management system with all the features you described - from purchase order intake to job completion and documentation.


No problem! I'll build a fully functional job management system with mock data so you can see how it works. You can connect Supabase later if you want to persist the data.

Let me create the complete system with:

Purchase order intake and job card generation
Team assignment (Farai, Burn, and others)
Status tracking workflow
Before/after photo uploads
Receipt attachments
Email integration simulation
Job completion and documentation
I've built a complete job management system for SGK Construction with all the features you requested. Here's what the system includes:

Full Job Lifecycle:

Create Job Cards from purchase orders with email/document attachments
Assign jobs to team members (Farai, Burn, Admore, John, Sarah) with scheduled dates
Status workflow: Pending → Assigned → In Progress → Completed
Photo management: Upload before/after photos at the job site
Receipt tracking: Attach material purchase receipts
Job completion: Automatically closes and sends to office when marked complete
Three main sections:

Job Cards - View all jobs with filtering by status, assign to team, view details
Create Job - Generate new job cards from purchase orders with document attachments
Team Management - See workload distribution and active jobs per team member
The system uses localStorage to persist data between sessions. When you're ready to add database storage, file uploads, and multi-user access, you can connect Supabase.

