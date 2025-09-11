import { NextRequest, NextResponse } from 'next/server';
import { getIslVideosWithMetadata } from '@/app/actions';

export async function GET(request: NextRequest) {
    try {
        console.log('Fetching male ISL videos...');
        const videos = await getIslVideosWithMetadata();
        console.log('Male videos fetched successfully:', videos.length);
        
        return NextResponse.json({
            success: true,
            videos: videos
        });
    } catch (error: any) {
        console.error('Error fetching male ISL videos:', error);
        return NextResponse.json({
            success: false,
            error: error.message || 'Failed to fetch male ISL videos'
        }, { status: 500 });
    }
}