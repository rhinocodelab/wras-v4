import { NextRequest, NextResponse } from 'next/server';
import { unlink } from 'fs/promises';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { files } = await request.json();

    if (!files || !Array.isArray(files)) {
      return NextResponse.json({ error: 'Invalid files array' }, { status: 400 });
    }

    const results = [];
    const errors = [];

    for (const file of files) {
      try {
        // Convert relative path to absolute path
        const filePath = path.join(process.cwd(), 'public', file.path);
        
        // Check if file exists and delete it
        await unlink(filePath);
        results.push({
          path: file.path,
          type: file.type,
          status: 'deleted'
        });
      } catch (error) {
        // File might not exist or permission error
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({
          path: file.path,
          type: file.type,
          error: errorMessage
        });
      }
    }

    return NextResponse.json({
      success: true,
      deleted: results,
      errors: errors,
      message: `Deleted ${results.length} files, ${errors.length} errors`
    });

  } catch (error) {
    console.error('Error deleting podcast files:', error);
    return NextResponse.json({ 
      error: 'Failed to delete files' 
    }, { status: 500 });
  }
}