import { NextRequest, NextResponse } from 'next/server';
import { unlink } from 'fs/promises';
import { join } from 'path';

export async function DELETE(request: NextRequest) {
  try {
    const { audioId } = await request.json();

    if (!audioId) {
      return NextResponse.json(
        { success: false, error: 'Missing audioId' },
        { status: 400 }
      );
    }

    const tempDir = join(process.cwd(), 'public', 'temp-audio');
    const possibleExtensions = ['webm', 'wav', 'mp3'];
    
    let deleted = false;
    
    // Try to delete the file with different extensions
    for (const ext of possibleExtensions) {
      const filePath = join(tempDir, `${audioId}.${ext}`);
      try {
        await unlink(filePath);
        console.log(`Deleted audio file: ${filePath}`);
        deleted = true;
        break;
      } catch (error) {
        // Continue to next extension
        continue;
      }
    }
    
    if (deleted) {
      return NextResponse.json({
        success: true,
        message: 'Audio file deleted successfully'
      });
    } else {
      return NextResponse.json(
        { success: false, error: 'Audio file not found' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Error deleting audio file:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}