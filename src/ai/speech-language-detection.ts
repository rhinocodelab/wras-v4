'use server';

/**
 * @fileOverview This file defines a Genkit flow for detecting the language of an audio recording.
 *
 * - detectAudioLanguage - A function that takes audio data as input and returns the detected language.
 * - DetectAudioLanguageInput - The input type for the detectAudioLanguage function.
 * - DetectAudioLanguageOutput - The return type for the detectAudioLanguage function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DetectAudioLanguageInputSchema = z.object({
  audioDataUri: z
    .string()
    .describe(
      'The audio recording as a data URI that must include a MIME type and use Base64 encoding. Expected format: \'data:<mimetype>;base64,<encoded_data>\'.' 
    ),
});
export type DetectAudioLanguageInput = z.infer<typeof DetectAudioLanguageInputSchema>;

const DetectAudioLanguageOutputSchema = z.object({
  language: z.string().describe('The detected language of the audio recording.'),
});
export type DetectAudioLanguageOutput = z.infer<typeof DetectAudioLanguageOutputSchema>;

export async function detectAudioLanguage(input: DetectAudioLanguageInput): Promise<DetectAudioLanguageOutput> {
  return detectAudioLanguageFlow(input);
}

const detectAudioLanguagePrompt = ai.definePrompt({
  name: 'detectAudioLanguagePrompt',
  input: {schema: DetectAudioLanguageInputSchema},
  output: {schema: DetectAudioLanguageOutputSchema},
  prompt: `You are an expert linguist. You will be provided with an audio recording. You must determine the language spoken in the audio. Return only the language name.

Audio: {{media url=audioDataUri}}`,
});

const detectAudioLanguageFlow = ai.defineFlow(
  {
    name: 'detectAudioLanguageFlow',
    inputSchema: DetectAudioLanguageInputSchema,
    outputSchema: DetectAudioLanguageOutputSchema,
  },
  async input => {
    const {output} = await detectAudioLanguagePrompt(input, {
      model: 'googleai/gemini-2.5-flash',
    });
    return output!;
  }
);