package com.bookfair.Stall_Reservation.security;

import com.bookfair.Stall_Reservation.config.JwtUtil;
import com.bookfair.Stall_Reservation.entity.User;
import com.bookfair.Stall_Reservation.enums.UserRole;
import com.bookfair.Stall_Reservation.repository.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;
    private final UserRepository userRepository;

    @Value("${app.oidc.enabled:false}")
    private boolean oidcEnabled;

    @Value("${app.oidc.jwk-set-uri:}")
    private String jwkSetUri;

    @Value("${app.oidc.admin-emails:}")
    private String adminEmailsProp;

    private JwtDecoder oidcJwtDecoder;
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public JwtAuthFilter(JwtUtil jwtUtil, UserRepository userRepository) {
        this.jwtUtil = jwtUtil;
        this.userRepository = userRepository;
    }

    private synchronized JwtDecoder getOidcJwtDecoder() {
        if (oidcJwtDecoder == null) {
            if (!StringUtils.hasText(jwkSetUri)) {
                throw new IllegalStateException("OIDC is enabled but app.oidc.jwk-set-uri is not configured.");
            }
            oidcJwtDecoder = NimbusJwtDecoder.withJwkSetUri(jwkSetUri).build();
        }
        return oidcJwtDecoder;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        try {
            String token = extractToken(request);
            if (StringUtils.hasText(token)) {
                if (oidcEnabled) {
                    // 1. Validate OIDC Token via cloud-based JWKS
                    Jwt jwt = getOidcJwtDecoder().decode(token);

                    // 2. Extract user profile information
                    String email = jwt.getClaimAsString("email");
                    String name = jwt.getClaimAsString("name");
                    if (name == null) {
                        name = jwt.getClaimAsString("nickname");
                    }
                    if (name == null) {
                        name = email; // Fallback to email as username
                    }

                    if (StringUtils.hasText(email)) {
                        // 3. Just-In-Time (JIT) Provisioning
                        User user = userRepository.findByEmail(email).orElse(null);
                        if (user == null) {
                            user = new User();
                            user.setEmail(email);
                            user.setName(name);
                            user.setPhone(""); // Can be filled in on profile page
                            user.setPasswordHash(passwordEncoder.encode(UUID.randomUUID().toString()));
                            
                            // Check if configured as Admin (Exhibition Organizer)
                            boolean isAdmin = false;
                            if (StringUtils.hasText(adminEmailsProp)) {
                                List<String> admins = Arrays.asList(adminEmailsProp.split(","));
                                if (admins.contains(email)) {
                                    isAdmin = true;
                                }
                            }
                            user.setRole(isAdmin ? UserRole.ADMIN : UserRole.VENDOR);
                            user = userRepository.save(user);
                            logger.info("Successfully JIT-provisioned OIDC user: " + email + " with role: " + user.getRole().name());
                        } else {
                            logger.info("Matched OIDC user session: " + email + " (local ID: " + user.getId() + ")");
                        }

                        // 4. Authenticate user in SecurityContext using local user database ID
                        var auth = new UsernamePasswordAuthenticationToken(
                                user.getId(),
                                null,
                                Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + user.getRole().name())));
                        logger.info("Authenticated session for ID: " + user.getId() + " (" + email + ") with role: ROLE_" + user.getRole().name());
                        auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                        SecurityContextHolder.getContext().setAuthentication(auth);
                    }
                } else {
                    // Fallback: Validate using local JWT tokens
                    if (jwtUtil.validateToken(token)) {
                        String role = jwtUtil.getRoleFromToken(token).name();
                        Object userIdObj = jwtUtil.getUserIdFromToken(token);
                        Long userId = null;
                        if (userIdObj instanceof Number) {
                            userId = ((Number) userIdObj).longValue();
                        } else if (userIdObj instanceof String) {
                            try {
                                userId = Long.parseLong((String) userIdObj);
                            } catch (Exception e) {
                            }
                        }

                        if (userId != null) {
                            var auth = new UsernamePasswordAuthenticationToken(
                                    userId,
                                    null,
                                    Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role)));
                            auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                            SecurityContextHolder.getContext().setAuthentication(auth);
                        }
                    }
                }
            }
        } catch (Exception e) {
            // Log security warning and continue: security framework will block unauthorized attempts
            logger.warn("Authentication failed: " + e.getMessage());
        }
        filterChain.doFilter(request, response);
    }

    private String extractToken(HttpServletRequest request) {
        String bearer = request.getHeader("Authorization");
        if (StringUtils.hasText(bearer) && bearer.startsWith("Bearer ")) {
            return bearer.substring(7);
        }
        return null;
    }
}
