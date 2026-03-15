import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  // This is a mock endpoint for the AI Studio preview environment.
  // Since the actual microservices (Backend, Redis, Worker, MySQL) 
  // run via Docker Compose, this mock prevents "Failed to fetch" errors 
  // when testing the UI in the browser preview.
  
  try {
    const body = await request.json();
    
    console.log('Mock API received like:', body);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Like queued successfully (Mocked for Preview)' 
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
}
