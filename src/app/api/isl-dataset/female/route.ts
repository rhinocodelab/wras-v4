import { NextRequest, NextResponse } from 'next/server';
import { getIslFemaleVideosWithMetadata } from '@/app/actions';

export async function GET(request: NextRequest) {
    try {
        console.log('Fetching female ISL videos...');
        const videos = await getIslFemaleVideosWithMetadata();
        console.log('Female videos fetched successfully:', videos.length);
        
        return NextResponse.json({
            success: true,
            videos: videos
        });
    } catch (error: any) {
        console.error('Error fetching female ISL videos:', error);
        return NextResponse.json({
            success: false,
            error: error.message || 'Failed to fetch female ISL videos'
        }, { status: 500 });
    }
}