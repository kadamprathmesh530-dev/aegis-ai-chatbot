import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const INITIAL_SCALE_FACTOR = Dimensions.get('screen').height / 90;
const DURATION = 600;

// ============================================================
// ANIMATED SPLASH OVERLAY
// ============================================================

export function AnimatedSplashOverlay() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let mounted = true;

    const startSplash = async () => {
      try {
        await SplashScreen.hideAsync();
      } catch (error) {
        console.log('Splash screen hide error:', error);
      }

      if (!mounted) return;

      // Start fade-out after the component is mounted
      const timer = setTimeout(() => {
        if (mounted) {
          setVisible(false);
        }
      }, DURATION);

      return () => clearTimeout(timer);
    };

    startSplash();

    return () => {
      mounted = false;
    };
  }, []);

  if (!visible) {
    return null;
  }

  const splashKeyframe = new Keyframe({
    0: {
      opacity: 1,
      transform: [{ scale: 1 }],
    },

    50: {
      opacity: 1,
      transform: [{ scale: 1 }],
    },

    100: {
      opacity: 0,
      transform: [{ scale: 1 }],
      easing: Easing.out(Easing.ease),
    },
  });

  return (
    <Animated.View
      entering={splashKeyframe
        .duration(DURATION)
        .withCallback((finished) => {
          'worklet';

          if (finished) {
            scheduleOnRN(setVisible, false);
          }
        })}
      style={styles.splashOverlay}
    >
      <Image
        style={styles.splashLogo}
        source={require('@/assets/images/aegisai-logo.png')}
        contentFit="contain"
      />
    </Animated.View>
  );
}

// ============================================================
// ANIMATED ICON
// ============================================================

const keyframe = new Keyframe({
  0: {
    transform: [{ scale: INITIAL_SCALE_FACTOR }],
  },

  100: {
    transform: [{ scale: 1 }],
    easing: Easing.elastic(0.7),
  },
});

const logoKeyframe = new Keyframe({
  0: {
    transform: [{ scale: 1.3 }],
    opacity: 0,
  },

  40: {
    transform: [{ scale: 1.3 }],
    opacity: 0,
    easing: Easing.elastic(0.7),
  },

  100: {
    opacity: 1,
    transform: [{ scale: 1 }],
    easing: Easing.elastic(0.7),
  },
});

const glowKeyframe = new Keyframe({
  0: {
    transform: [{ rotateZ: '0deg' }],
  },

  100: {
    transform: [{ rotateZ: '7200deg' }],
  },
});

// ============================================================
// ANIMATED ICON COMPONENT
// ============================================================

export function AnimatedIcon() {
  return (
    <View style={styles.iconContainer}>

      {/* Glow */}
      <Animated.View
        entering={glowKeyframe.duration(60 * 1000 * 4)}
        style={styles.glow}
      >
        <Image
          style={styles.glow}
          source={require('@/assets/images/logo-glow.png')}
          contentFit="contain"
        />
      </Animated.View>

      {/* Background */}
      <Animated.View
        entering={keyframe.duration(DURATION)}
        style={styles.background}
      />

      {/* AegisAI Logo */}
      <Animated.View
        style={styles.imageContainer}
        entering={logoKeyframe.duration(DURATION)}
      >
        <Image
          style={styles.image}
          source={require('@/assets/images/aegisai-logo.png')}
          contentFit="contain"
        />
      </Animated.View>

    </View>
  );
}

// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({

  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  glow: {
    width: 201,
    height: 201,
    position: 'absolute',
  },

  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 128,
    height: 128,
    zIndex: 100,
  },

  image: {
    width: 76,
    height: 76,
  },

  background: {
    borderRadius: 40,
    experimental_backgroundImage:
      'linear-gradient(180deg, #3C9FFE, #0274DF)',
    width: 128,
    height: 128,
    position: 'absolute',
  },

  splashOverlay: {
  ...StyleSheet.absoluteFill,
  backgroundColor: '#0b0b0f',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },

  splashLogo: {
    width: 150,
    height: 150,
  },

});