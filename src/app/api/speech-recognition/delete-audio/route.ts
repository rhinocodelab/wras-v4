import { NextRequest, NextResponse } from 'next/server';
import { unlink } from 'fs/promises';
import path from 'path';

export async function DELETE(request: NextRequest) {
    try {
        const { audioId } = await request.json();

        if (!audioId) {
            return NextResponse.json({
                success: false,
                error: 'Audio ID is required'
            }, { status: 400 });
        }

        // Construct the file path
        const audioFilePath = path.join(process.cwd(), 'public', 'temp-audio', `${audioId}.audio`);

        try {
            // Delete the file
            await unlink(audioFilePath);
            console.log(`Audio file deleted: ${audioFilePath}`);

            return NextResponse.json({
                success: true,
                message: 'Audio file deleted successfully'
            });
        } catch (fileError: any) {
            if (fileError.code === 'ENOENT') {
                // File doesn't exist, which is fine
                console.log(`Audio file not found: ${audioFilePath}`);
                return NextResponse.json({
                    success: true,
                    message: 'Audio file not found (already deleted)'
                });
            } else {
                throw fileError;
            }
        }

    } catch (error: any) {
        console.error('Error deleting audio file:', error);
        return NextResponse.json({
            success: false,
            error: error.message || 'Failed to delete audio file'
        }, { status: 500 });
    }
}