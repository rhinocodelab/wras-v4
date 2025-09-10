import { NextRequest, NextResponse } from 'next/server';
import { syncIslDatasetWithDatabase } from '@/app/actions';

export async function POST(request: NextRequest) {
    try {
        console.log('Starting ISL dataset sync with database...');
        await syncIslDatasetWithDatabase();
        console.log('ISL dataset sync completed successfully');
        
        return NextResponse.json({
            success: true,
            message: 'ISL dataset synchronized with database successfully'
        });
    } catch (error: any) {
        console.error('Error syncing ISL dataset:', error);
        return NextResponse.json({
            success: false,
            error: error.message || 'Failed to sync ISL dataset'
        }, { status: 500 });
    }
}