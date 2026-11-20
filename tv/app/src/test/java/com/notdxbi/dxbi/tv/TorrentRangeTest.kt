package com.notdxbi.dxbi.tv

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TorrentRangeTest {
    @Test
    fun parsesNormalOpenAndSuffixRanges() {
        assertArrayEquals(longArrayOf(0L, 499L, 1L), TorrentEngine.parseRange("bytes=0-499", 1000L))
        assertArrayEquals(longArrayOf(500L, 999L, 1L), TorrentEngine.parseRange("bytes=500-", 1000L))
        assertArrayEquals(longArrayOf(800L, 999L, 1L), TorrentEngine.parseRange("bytes=-200", 1000L))
        assertArrayEquals(longArrayOf(0L, 999L, 1L), TorrentEngine.parseRange("bytes=-5000", 1000L))
        assertArrayEquals(longArrayOf(0L, 999L, 0L), TorrentEngine.parseRange(null, 1000L))
    }

    @Test
    fun rejectsOutOfBoundsAndInvertedRanges() {
        assertNull(TorrentEngine.parseRange("bytes=1000-1200", 1000L))
        assertNull(TorrentEngine.parseRange("bytes=500-400", 1000L))
        assertNull(TorrentEngine.parseRange("bytes=-0", 1000L))
        assertNull(TorrentEngine.parseRange("bytes=0-10", 0L))
    }
}
